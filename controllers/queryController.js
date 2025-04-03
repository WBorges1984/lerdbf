import * as queryModel from '../models/queryModel.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DBFFile } from 'dbffile'; 
import { dbConfig } from '../dbConfig.js';

// Obter o diretório atual usando ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Defina o diretório onde seus arquivos DBF estão armazenados
// Aqui você precisa ajustar para o caminho ABSOLUTO onde estão seus arquivos
const DBF_DIRECTORY = process.env.DBF_DIRECTORY || path.join(dbConfig.DBF_BASE_DIR);

// Função auxiliar para converter string para data, considerando o formato DBF (YYYYMMDD)
const parseDBFDate = (dateString) => {
  if (!dateString) return null;
  
  // Se for uma data já no formato Date
  if (dateString instanceof Date) return dateString;
  
  // Se for string, tentar converter
  if (typeof dateString === 'string') {
    // Remover espaços em branco
    dateString = dateString.trim();
    
    // Se estiver no formato YYYYMMDD (comum em arquivos DBF)
    if (dateString.length === 8 && !dateString.includes('-')) {
      const year = dateString.substring(0, 4);
      const month = dateString.substring(4, 6);
      const day = dateString.substring(6, 8);
      return new Date(`${year}-${month}-${day}`);
    }
    
    // Tenta converter normalmente
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
};

// Controller para obter todos os registros de uma tabela DBF
export const getAllRecords = async (req, res) => {
  try {
    const { tableName } = req.params;
    const { 
      dateField,
      startDate,
      endDate,
      limit = 1000 // Limite padrão de registros
    } = req.query;
    
    // Validar nome da tabela para evitar injeção de caminho
    if (!tableName || /[\/\\]/.test(tableName)) {
      return res.status(400).json({ error: 'Nome de tabela inválido' });
    }
    
    // Certificar-se de que o nome da tabela termina com .DBF
    const fileName = tableName.toUpperCase().endsWith('.DBF') 
      ? tableName.toUpperCase() 
      : `${tableName.toUpperCase()}.DBF`;
    
    // Construir o caminho completo do arquivo
    const filePath = path.resolve(DBF_DIRECTORY, fileName);
    
    console.log(`Tentando acessar arquivo: ${filePath}`);
    console.log(`Filtros: campo=${dateField}, inicio=${startDate}, fim=${endDate}`);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: `Arquivo '${fileName}' não encontrado`,
        details: `Verifique se o arquivo existe no diretório: ${DBF_DIRECTORY}`
      });
    }
    
    try {
      // Ler o arquivo DBF
      const dbf = await DBFFile.open(filePath);
      const fields = dbf.fields;
      let records = await dbf.readRecords();
      
      console.log(`Total de registros lidos: ${records.length}`);
      console.log('Campos disponíveis:', fields.map(f => f.name));
      
      // Converter datas
      const startDateObj = startDate ? new Date(startDate) : null;
      const endDateObj = endDate ? new Date(endDate) : null;
      
      // Aplicar filtro de data se solicitado
      if (dateField && (startDate || endDate)) {
        const fieldIndex = fields.findIndex(f => 
          f.name.toUpperCase() === dateField.toUpperCase()
        );
        
        if (fieldIndex === -1) {
          return res.status(400).json({ 
            error: `Campo de data '${dateField}' não encontrado`,
            availableFields: fields.map(f => f.name)
          });
        }
        
        const fieldName = fields[fieldIndex].name;
        console.log(`Filtrando pelo campo: ${fieldName}`);
        
        // Mostrar alguns registros com suas datas para debug
        console.log('Amostra de valores de data:');
        records.slice(0, 5).forEach(rec => {
          console.log(`Registro data ${fieldName}:`, rec[fieldName], 
            'convertido:', parseDBFDate(rec[fieldName]));
        });
        
        // Filtrar registros por data
        records = records.filter(record => {
          const recordDateValue = record[fieldName];
          if (!recordDateValue) return false;
          
          const recordDate = parseDBFDate(recordDateValue);
          if (!recordDate) return false;
          
          let include = true;
          
          if (startDateObj) {
            include = include && recordDate >= startDateObj;
          }
          
          if (endDateObj) {
            include = include && recordDate <= endDateObj;
          }
          
          return include;
        });
        
        console.log(`Registros após filtro de data: ${records.length}`);
      }
      
      // Aplicar limite se necessário
      const limitedRecords = limit ? records.slice(0, parseInt(limit)) : records;
      
      res.json({
        success: true,
        tableName: fileName,
        totalRecords: records.length,
        returnedRecords: limitedRecords.length,
        fields: fields.map(f => ({ name: f.name, type: f.type })),
        records: limitedRecords
      });
      
    } catch (dbfError) {
      console.error('Erro ao processar o arquivo DBF:', dbfError);
      res.status(500).json({
        error: `Erro ao processar o arquivo DBF '${fileName}'`,
        details: dbfError.message
      });
    }
    
  } catch (error) {
    console.error('Erro ao ler registros da tabela:', error);
    res.status(500).json({ 
      error: `Erro ao ler registros da tabela '${req.params.tableName}'`,
      details: error.message
    });
  }
};
// Controller para retornar registros filtrados de uma tabela
export async function getFilteredRecords(req, res) {
  try {
    const { tableName } = req.params;
    const { field, value, limit } = req.query;
    const recordLimit = limit ? parseInt(limit) : undefined;
    
    if (!tableName) {
      return res.status(400).json({
        error: 'Nome da tabela não especificado'
      });
    }
    
    if (!field || !value) {
      return res.status(400).json({
        error: 'Parâmetros de filtro incompletos. Use "field" e "value" como query parameters'
      });
    }
    
    const result = await queryModel.readFilteredRecords(tableName, field, value);
    
    // Se há um limite especificado, truncar os resultados
    if (recordLimit && recordLimit > 0 && recordLimit < result.records.length) {
      result.records = result.records.slice(0, recordLimit);
      result.limitApplied = recordLimit;
    }
    
    res.json(result);
  } catch (error) {
    console.error(`Erro ao filtrar registros: ${error.message}`);
    res.status(500).json({
      error: error.message
    });
  }
}