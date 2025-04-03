import express from 'express';
import * as dbfController from './controllers/dbfController.js';
import * as queryController from './controllers/queryController.js'

const router = express.Router();

// Rota para gerar script SQL para todos os arquivos DBF
router.get('/sql-script', dbfController.generateSqlScript);

// Rota para tratar especificamente o arquivo CLIENTE.DBF
router.get('/fix-cliente', dbfController.fixCliente);

// Rota para debug de um único arquivo DBF
router.get('/debug-dbf/:filename', dbfController.debugDbf);

// Novas rotas para consulta de dados
router.get('/table/:tableName', queryController.getAllRecords);
router.get('/table/:tableName/filter', queryController.getFilteredRecords);

export default router;