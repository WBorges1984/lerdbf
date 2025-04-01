import express from 'express';
import { DBFFile } from 'dbffile';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Diretório base dos arquivos DBF
const DBF_BASE_DIR = 'C:\\Bases\\MANAB';

// Lista de arquivos que precisam de tratamento especial
const SPECIAL_TREATMENT_FILES = ['CLIENTE.DBF', 'CLIENTE.dbf', 'cliente.dbf'];

// Endpoint para gerar o script SQL para todos os arquivos DBF
app.get('/sql-script', async (req, res) => {
  try {
    const files = fs.readdirSync(DBF_BASE_DIR)
      .filter(file => file.toLowerCase().endsWith('.dbf'));
    
    console.log(`Encontrados ${files.length} arquivos DBF`);
    
    // Array para armazenar os comandos SQL
    let sqlCommands = [];
    let failedFiles = [];
    
    // Processar cada arquivo
    for (const filename of files) {
      try {
        const dbfPath = path.join(DBF_BASE_DIR, filename);
        console.log(`Processando arquivo: ${dbfPath}`);
        
        const dbf = await DBFFile.open(dbfPath);
        
        // Nome da tabela (remove a extensão .dbf)
        const tableName = path.basename(filename, '.dbf').toLowerCase();
        
        // Verificar o tamanho total estimado da linha antes de gerar o SQL
        const estimatedRowSize = calculateEstimatedRowSize(dbf.fields);
        console.log(`Tamanho estimado da linha para ${tableName}: ${estimatedRowSize} bytes`);
        
        // Tratamento especial para arquivos específicos ou tabelas com linha grande
        const needsSpecialTreatment = SPECIAL_TREATMENT_FILES.includes(filename) || 
                                      estimatedRowSize > 40000; // Reduzido o limite para ser mais conservador
        
        // Gerar SQL para criar a tabela com tratamento para o limite de tamanho
        const createTableSQL = generateCreateTableSQL(tableName, dbf.fields, needsSpecialTreatment);
        
        // Adicionar ao array de comandos
        sqlCommands.push(createTableSQL);
      } catch (err) {
        console.error(`Erro ao processar arquivo ${filename}: ${err.message}`);
        failedFiles.push({ filename, error: err.message });
      }
    }
    
    // Configurar o cabeçalho da resposta para texto puro
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="create_tables.sql"');
    
    // Juntar todos os comandos com ponto e vírgula e nova linha entre cada comando
    const sqlScript = sqlCommands.join(';\n\n') + ';';
    
    // Se houver arquivos com falha, adicionar como comentário no final do script
    if (failedFiles.length > 0) {
      const failureComments = failedFiles.map(f => 
        `-- Falha ao processar: ${f.filename} - Erro: ${f.error}`
      ).join('\n');
      
      res.send(sqlScript + '\n\n-- ARQUIVOS COM ERRO:\n' + failureComments);
    } else {
      res.send(sqlScript);
    }
    
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).send(`-- Erro ao processar os arquivos DBF: ${error.message}`);
  }
});

// Função para calcular o tamanho estimado da linha
function calculateEstimatedRowSize(fields) {
  // Cálculo conservador do tamanho estimado da linha com base nos tipos de campo
  return fields.reduce((total, field) => {
    let byteSize = 0;
    
    switch (field.type) {
      case 'C': // Character
        // VARCHAR ocupa o comprimento do campo + 1 ou 2 bytes para armazenar o tamanho
        // Multiplicamos por 4 para ser mais conservador com UTF-8 (pior caso)
        byteSize = (field.length || 255) * 4 + 2; 
        break;
      case 'N': // Numeric
        if (field.decimalCount > 0) {
          byteSize = 8; // DECIMAL pode ocupar até 8 bytes
        } else {
          byteSize = 4; // INT ocupa 4 bytes
        }
        break;
      case 'F': // Float
        byteSize = 8; // DECIMAL pode ocupar até 8 bytes
        break;
      case 'L': // Logical
        byteSize = 1; // BOOLEAN ocupa 1 byte
        break;
      case 'D': // Date
        byteSize = 3; // DATE ocupa 3 bytes
        break;
      case 'T': // DateTime
        byteSize = 8; // DATETIME ocupa 8 bytes
        break;
      case 'M': // Memo
        byteSize = 0; // TEXT (BLOB) não conta para o limite de tamanho
        break;
      default:
        byteSize = 255 * 4 + 2; // Valor padrão para tipos desconhecidos
    }
    
    return total + byteSize;
  }, 0);
}

// Função para gerar comando CREATE TABLE - CORRIGIDA com tratamento para limite de tamanho
function generateCreateTableSQL(tableName, fields, useAggressiveTextConversion = false) {
  const columnDefinitions = fields.map(field => {
    let sqlType = '';
    
    // Mapear tipos DBF para tipos MySQL com tratamento para valores indefinidos
    switch (field.type) {
      case 'C': // Character
        const charLength = field.length !== undefined ? field.length : 255;
        
        // Tratamento mais agressivo para VARCHAR
        if (useAggressiveTextConversion) {
          // Se o arquivo precisa de tratamento especial e o campo é grande, usar TEXT
          if (charLength > 100) {
            sqlType = 'TEXT';
          } else {
            sqlType = `VARCHAR(${charLength})`;
          }
        } else {
          // Tratamento normal
          if (charLength > 255) {
            sqlType = 'TEXT';
          } else {
            sqlType = `VARCHAR(${charLength})`;
          }
        }
        break;
      case 'N': // Numeric
        if (field.decimalCount > 0) {
          // Usar valores padrão se indefinidos
          const numLength = field.length !== undefined ? field.length : 10;
          const decimalCount = field.decimalCount !== undefined ? field.decimalCount : 2;
          sqlType = `DECIMAL(${numLength},${decimalCount})`;
        } else {
          // Usar valor padrão se indefinido
          const intLength = field.length !== undefined ? field.length : 10;
          // Limitamos o tamanho máximo para INT
          sqlType = intLength > 11 ? 'BIGINT' : `INT(${intLength})`;
        }
        break;
      case 'F': // Float
        // Usar valores padrão se indefinidos
        const floatLength = field.length !== undefined ? field.length : 10;
        const decimalCount = field.decimalCount !== undefined ? field.decimalCount : 2;
        sqlType = `DECIMAL(${floatLength},${decimalCount})`;
        break;
      case 'L': // Logical
        sqlType = 'BOOLEAN';
        break;
      case 'D': // Date
        sqlType = 'DATE';
        break;
      case 'T': // DateTime
        sqlType = 'DATETIME';
        break;
      case 'M': // Memo
        sqlType = 'TEXT';
        break;
      default:
        // Tipo desconhecido, usar VARCHAR(255) como padrão seguro
        sqlType = useAggressiveTextConversion ? 'TEXT' : 'VARCHAR(255)';
    }
    
    // Imprimir informações de debug sobre o campo
    console.log(`Campo: ${field.name}, Tipo: ${field.type}, Comprimento: ${field.length}, Tipo SQL: ${sqlType}`);
    
    return `\`${field.name}\` ${sqlType}`;
  }).join(',\n  ');
  
  // Adicionar comentário sobre o tratamento de limite de tamanho
  let comment = `-- Tabela gerada a partir do arquivo: ${tableName}.dbf`;
  if (useAggressiveTextConversion) {
    comment += '\n-- NOTA: Campos grandes foram convertidos para TEXT devido ao limite de tamanho de linha do MySQL';
  }
  
  return `${comment}\nCREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${columnDefinitions}\n)`;
}

// Endpoint específico para verificar e gerar SQL para CLIENTE.DBF
app.get('/fix-cliente', async (req, res) => {
  try {
    const clienteDbfPath = path.join(DBF_BASE_DIR, 'CLIENTE.DBF');
    
    // Verifica se existe o arquivo (maiúsculo)
    if (!fs.existsSync(clienteDbfPath)) {
      // Tenta com minúsculo
      const lowerCasePath = path.join(DBF_BASE_DIR, 'cliente.dbf');
      if (!fs.existsSync(lowerCasePath)) {
        return res.status(404).send('Arquivo CLIENTE.DBF não encontrado');
      }
    }
    
    const dbf = await DBFFile.open(clienteDbfPath);
    console.log('Estrutura de CLIENTE.DBF:', dbf.fields);
    
    // Gerar SQL com conversão extremamente agressiva (quase todos para TEXT)
    const sqlCommand = generateSuperAggressiveClienteSQL('cliente', dbf.fields);
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(sqlCommand);
  } catch (error) {
    console.error('Erro ao processar CLIENTE.DBF:', error);
    res.status(500).send(`-- Erro ao processar CLIENTE.DBF: ${error.message}`);
  }
});

// Função especializada para gerar SQL para CLIENTE.DBF
function generateSuperAggressiveClienteSQL(tableName, fields) {
  const columnDefinitions = fields.map(field => {
    let sqlType = '';
    
    // Estratégia super agressiva: converter a maioria dos campos para TEXT
    switch (field.type) {
      case 'C': // Character
        // Converter quase todos os campos de caractere para TEXT
        const charLength = field.length !== undefined ? field.length : 255;
        
        // Apenas campos muito pequenos ficam como VARCHAR
        if (charLength < 50) {
          sqlType = `VARCHAR(${charLength})`;
        } else {
          sqlType = 'TEXT';
        }
        break;
      case 'N': // Numeric
        if (field.decimalCount > 0) {
          sqlType = `DECIMAL(${field.length || 10},${field.decimalCount || 2})`;
        } else {
          sqlType = field.length > 9 ? 'BIGINT' : `INT(${field.length || 10})`;
        }
        break;
      case 'F': // Float
        sqlType = `DECIMAL(${field.length || 10},${field.decimalCount || 2})`;
        break;
      case 'L': // Logical
        sqlType = 'BOOLEAN';
        break;
      case 'D': // Date
        sqlType = 'DATE';
        break;
      case 'T': // DateTime
        sqlType = 'DATETIME';
        break;
      case 'M': // Memo
        sqlType = 'TEXT';
        break;
      default:
        sqlType = 'TEXT';
    }
    
    return `\`${field.name}\` ${sqlType}`;
  }).join(',\n  ');
  
  const comment = `-- Tabela CLIENTE gerada com tratamento especial para evitar erro de tamanho de linha
-- NOTA: Campos convertidos para TEXT de forma agressiva`;
  
  return `${comment}\nCREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${columnDefinitions}\n)`;
}

// Adicionar uma rota para debug de um único arquivo
app.get('/debug-dbf/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const dbfPath = path.join(DBF_BASE_DIR, filename);
    
    if (!fs.existsSync(dbfPath)) {
      return res.status(404).send(`Arquivo ${filename} não encontrado`);
    }
    
    const dbf = await DBFFile.open(dbfPath);
    
    // Calcular o tamanho estimado da linha
    const estimatedRowSize = calculateEstimatedRowSize(dbf.fields);
    
    // Identificar campos grandes que poderiam ser convertidos para TEXT
    const largeFields = dbf.fields
      .filter(f => (f.type === 'C' && (f.length > 100)))
      .map(f => ({
        name: f.name,
        type: f.type,
        length: f.length,
        estimatedBytes: getFieldSizeEstimate(f)
      }))
      .sort((a, b) => b.estimatedBytes - a.estimatedBytes);
    
    res.json({
      filename: filename,
      fieldCount: dbf.fields.length,
      estimatedRowSize: estimatedRowSize,
      exceedsLimit: estimatedRowSize > 65535,
      potentialSavingsByConvertingLargeFields: largeFields.reduce((total, f) => total + f.estimatedBytes, 0),
      largeFields: largeFields,
      allFields: dbf.fields.map(f => ({
        name: f.name,
        type: f.type,
        length: f.length,
        decimalCount: f.decimalCount,
        estimatedBytes: getFieldSizeEstimate(f)
      })).sort((a, b) => b.estimatedBytes - a.estimatedBytes)
    });
  } catch (error) {
    res.status(500).send(`Erro ao processar arquivo: ${error.message}`);
  }
});

// Função auxiliar para estimar o tamanho de um campo individual
function getFieldSizeEstimate(field) {
  switch (field.type) {
    case 'C': return (field.length || 255) * 4 + 2;
    case 'N': return field.decimalCount > 0 ? 8 : 4;
    case 'F': return 8;
    case 'L': return 1;
    case 'D': return 3;
    case 'T': return 8;
    case 'M': return 0; // Não conta para o limite
    default: return 255 * 4 + 2;
  }
}

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:3000`);
  console.log(`Diretório de arquivos DBF: ${DBF_BASE_DIR}`);
  console.log(`Acesse http://localhost:3000/sql-script para obter o script SQL completo`);
  console.log(`Acesse http://localhost:3000/fix-cliente para tratar especificamente CLIENTE.DBF`);
  console.log(`Acesse http://localhost:3000/debug-dbf/CLIENTE.DBF para analisar a estrutura de CLIENTE.DBF`);
});