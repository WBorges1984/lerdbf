import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes.js';
import { dbConfig } from './dbConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Diretório base dos arquivos DBF
export const DBF_BASE_DIR = dbConfig.DBF_BASE_DIR;

// Middleware para parsing de JSON
app.use(express.json());

// Middleware para logging de requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Usar as rotas definidas em routes.js
app.use('/', routes);

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:3000`);
  console.log(`Diretório de arquivos DBF: ${DBF_BASE_DIR}`);
  console.log(`Rotas disponíveis:`);
  console.log(`- http://localhost:3000/sql-script - Script SQL completo`);
  console.log(`- http://localhost:3000/fix-cliente - Tratamento para CLIENTE.DBF`);
  console.log(`- http://localhost:3000/debug-dbf/:filename - Análise de um arquivo DBF`);
  console.log(`- http://localhost:3000/table/:tableName - Todos os registros de uma tabela`);
  console.log(`- http://localhost:3000/table/:tableName/filter?field=X&value=Y - Registros filtrados`);
});