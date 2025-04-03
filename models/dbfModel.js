import { DBFFile } from 'dbffile';
import path from 'path';
import fs from 'fs';
import { DBF_BASE_DIR } from '../app.js';

// Lista de arquivos que precisam de tratamento especial
const SPECIAL_TREATMENT_FILES = ['CLIENTE.DBF', 'CLIENTE.dbf', 'cliente.dbf'];

// Função para abrir e obter info de um arquivo DBF
export async function openDbfFile(filename) {
  const dbfPath = path.join(DBF_BASE_DIR, filename);
  return await DBFFile.open(dbfPath);
}

// Função para listar todos os arquivos DBF no diretório
export function listDbfFiles() {
  return fs.readdirSync(DBF_BASE_DIR)
    .filter(file => file.toLowerCase().endsWith('.dbf'));
}

// Função para verificar se um arquivo precisa de tratamento especial
export function needsSpecialTreatment(filename, estimatedRowSize) {
  return SPECIAL_TREATMENT_FILES.includes(filename) || estimatedRowSize > 40000;
}

// Função para calcular o tamanho estimado da linha
export function calculateEstimatedRowSize(fields) {
  return fields.reduce((total, field) => {
    return total + getFieldSizeEstimate(field);
  }, 0);
}

// Função auxiliar para estimar o tamanho de um campo individual
export function getFieldSizeEstimate(field) {
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

// Função para gerar comando CREATE TABLE
export function generateCreateTableSQL(tableName, fields, useAggressiveTextConversion = false) {
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

// Função especializada para gerar SQL para CLIENTE.DBF
export function generateSuperAggressiveClienteSQL(tableName, fields) {
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