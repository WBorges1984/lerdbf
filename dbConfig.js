
// Configurações relacionadas ao banco de dados e arquivos DBF
export const dbConfig = {
    // Diretório base dos arquivos DBF
    DBF_BASE_DIR: 'C:\\Bases\\MANAB',
    // DBF_BASE_DIR: 'C:\\HUMANNA_MEDICAL\\EFW',
    
    // Lista de arquivos que precisam de tratamento especial
    SPECIAL_TREATMENT_FILES: ['CLIENTE.DBF', 'CLIENTE.dbf', 'cliente.dbf'],
    
    // Limite de tamanho para conversão mais agressiva
    ROW_SIZE_LIMIT: 40000,
    
    // Limite rigoroso do MySQL para tamanho de linha
    MYSQL_ROW_SIZE_LIMIT: 65535
  };