import path from 'path';
import fs from 'fs';
import { DBF_BASE_DIR } from '../app.js';
import * as dbfModel from '../models/dbfModel.js';

// Controller para gerar script SQL para todos os arquivos DBF
export async function generateSqlScript(req, res) {
  try {
    const files = dbfModel.listDbfFiles();
    
    console.log(`Encontrados ${files.length} arquivos DBF`);
    
    // Array para armazenar os comandos SQL
    let sqlCommands = [];
    let failedFiles = [];
    
    // Processar cada arquivo
    for (const filename of files) {
      try {
        const dbfPath = path.join(DBF_BASE_DIR, filename);
        console.log(`Processando arquivo: ${dbfPath}`);
        
        const dbf = await dbfModel.openDbfFile(filename);
        
        // Nome da tabela (remove a extensão .dbf)
        const tableName = path.basename(filename, '.dbf').toLowerCase();
        
        // Verificar o tamanho total estimado da linha antes de gerar o SQL
        const estimatedRowSize = dbfModel.calculateEstimatedRowSize(dbf.fields);
        console.log(`Tamanho estimado da linha para ${tableName}: ${estimatedRowSize} bytes`);
        
        // Tratamento especial para arquivos específicos ou tabelas com linha grande
        const needsSpecialTreatment = dbfModel.needsSpecialTreatment(filename, estimatedRowSize);
        
        // Gerar SQL para criar a tabela com tratamento para o limite de tamanho
        const createTableSQL = dbfModel.generateCreateTableSQL(tableName, dbf.fields, needsSpecialTreatment);
        
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
}

// Controller para tratar especificamente o arquivo CLIENTE.DBF
export async function fixCliente(req, res) {
  try {
    let clienteDbfPath = path.join(DBF_BASE_DIR, 'CLIENTE.DBF');
    
    // Verifica se existe o arquivo (maiúsculo)
    if (!fs.existsSync(clienteDbfPath)) {
      // Tenta com minúsculo
      const lowerCasePath = path.join(DBF_BASE_DIR, 'cliente.dbf');
      if (fs.existsSync(lowerCasePath)) {
        clienteDbfPath = lowerCasePath;
      } else {
        return res.status(404).send('Arquivo CLIENTE.DBF não encontrado');
      }
    }
    
    const dbf = await dbfModel.openDbfFile(path.basename(clienteDbfPath));
    console.log('Estrutura de CLIENTE.DBF:', dbf.fields);
    
    // Gerar SQL com conversão extremamente agressiva (quase todos para TEXT)
    const sqlCommand = dbfModel.generateSuperAggressiveClienteSQL('cliente', dbf.fields);
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(sqlCommand);
  } catch (error) {
    console.error('Erro ao processar CLIENTE.DBF:', error);
    res.status(500).send(`-- Erro ao processar CLIENTE.DBF: ${error.message}`);
  }
}

// Controller para debug de um único arquivo DBF
export async function debugDbf(req, res) {
  try {
    const filename = req.params.filename;
    const dbfPath = path.join(DBF_BASE_DIR, filename);
    
    if (!fs.existsSync(dbfPath)) {
      return res.status(404).send(`Arquivo ${filename} não encontrado`);
    }
    
    const dbf = await dbfModel.openDbfFile(filename);
    
    // Calcular o tamanho estimado da linha
    const estimatedRowSize = dbfModel.calculateEstimatedRowSize(dbf.fields);
    
    // Identificar campos grandes que poderiam ser convertidos para TEXT
    const largeFields = dbf.fields
      .filter(f => (f.type === 'C' && (f.length > 100)))
      .map(f => ({
        name: f.name,
        type: f.type,
        length: f.length,
        estimatedBytes: dbfModel.getFieldSizeEstimate(f)
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
        estimatedBytes: dbfModel.getFieldSizeEstimate(f)
      })).sort((a, b) => b.estimatedBytes - a.estimatedBytes)
    });
  } catch (error) {
    res.status(500).send(`Erro ao processar arquivo: ${error.message}`);
  }
}