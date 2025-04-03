import * as queryModel from '../models/queryModel.js';

// Controller para retornar todos os registros de uma tabela
export async function getAllRecords(req, res) {
  try {
    const { tableName } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
    
    if (!tableName) {
      return res.status(400).json({
        error: 'Nome da tabela não especificado'
      });
    }
    
    const result = await queryModel.readAllRecords(tableName);
    
    // Se há um limite especificado, truncar os resultados
    if (limit && limit > 0 && limit < result.records.length) {
      result.records = result.records.slice(0, limit);
      result.limitApplied = limit;
    }
    
    res.json(result);
  } catch (error) {
    console.error(`Erro ao consultar registros: ${error.message}`);
    res.status(500).json({
      error: error.message
    });
  }
}

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