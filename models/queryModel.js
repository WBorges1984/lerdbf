// Função para abrir um arquivo DBF e retornar todos os registros
export async function readAllRecords(tableName) {
    try {
      // Verificar diferentes possíveis formatações do nome do arquivo (maiúsc./minúsc.)
      const possiblePaths = [
        path.join(DBF_BASE_DIR, `${tableName.toUpperCase()}.DBF`),
        path.join(DBF_BASE_DIR, `${tableName.toLowerCase()}.dbf`),
        path.join(DBF_BASE_DIR, `${tableName}.DBF`),
        path.join(DBF_BASE_DIR, `${tableName}.dbf`)
      ];
  
      // Encontrar o primeiro caminho que existe
      let dbfPath = null;
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          dbfPath = possiblePath;
          break;
        }
      }
  
      if (!dbfPath) {
        throw new Error(`Arquivo DBF para tabela '${tableName}' não encontrado`);
      }
  
      // Abrir o arquivo DBF
      const dbf = await DBFFile.open(dbfPath);
      
      // Ler todos os registros
      const records = await dbf.readRecords();
      
      // Obter informações dos campos para retornar metadados
      const fields = dbf.fields.map(field => ({
        name: field.name,
        type: field.type,
        length: field.length,
        decimalCount: field.decimalCount
      }));
      
      return {
        tableName,
        totalRecords: records.length,
        fields,
        records
      };
    } catch (error) {
      throw new Error(`Erro ao ler registros da tabela '${tableName}': ${error.message}`);
    }
  }
  
  // Função para abrir um arquivo DBF e retornar registros filtrados
  export async function readFilteredRecords(tableName, fieldName, filterValue) {
    try {
      // Verificar diferentes possíveis formatações do nome do arquivo (maiúsc./minúsc.)
      const possiblePaths = [
        path.join(DBF_BASE_DIR, `${tableName.toUpperCase()}.DBF`),
        path.join(DBF_BASE_DIR, `${tableName.toLowerCase()}.dbf`),
        path.join(DBF_BASE_DIR, `${tableName}.DBF`),
        path.join(DBF_BASE_DIR, `${tableName}.dbf`)
      ];
  
      // Encontrar o primeiro caminho que existe
      let dbfPath = null;
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          dbfPath = possiblePath;
          break;
        }
      }
  
      if (!dbfPath) {
        throw new Error(`Arquivo DBF para tabela '${tableName}' não encontrado`);
      }
  
      // Abrir o arquivo DBF
      const dbf = await DBFFile.open(dbfPath);
      
      // Verificar se o campo existe
      const fieldExists = dbf.fields.some(field => 
        field.name.toLowerCase() === fieldName.toLowerCase()
      );
      
      if (!fieldExists) {
        throw new Error(`Campo '${fieldName}' não encontrado na tabela '${tableName}'`);
      }
      
      // Ler todos os registros
      const allRecords = await dbf.readRecords();
      
      // Filtrar registros
      // Usamos toLowerCase() para fazer uma comparação case-insensitive
      // e toString() para garantir que a comparação funcione com diferentes tipos de dados
      const filteredRecords = allRecords.filter(record => {
        // Se o valor do registro for nulo/indefinido, converte para string vazia
        const recordValue = (record[fieldName] !== null && record[fieldName] !== undefined) 
          ? record[fieldName].toString().toLowerCase() 
          : '';
        
        // Converte o valor de filtro para string minúscula
        const searchValue = filterValue.toString().toLowerCase();
        
        // Verifica se o valor do registro contém o valor de filtro
        return recordValue.includes(searchValue);
      });
      
      // Obter informações dos campos para retornar metadados
      const fields = dbf.fields.map(field => ({
        name: field.name,
        type: field.type,
        length: field.length,
        decimalCount: field.decimalCount
      }));
      
      return {
        tableName,
        filterField: fieldName,
        filterValue: filterValue,
        totalRecords: filteredRecords.length,
        fields,
        records: filteredRecords
      };
    } catch (error) {
      throw new Error(`Erro ao filtrar registros da tabela '${tableName}': ${error.message}`);
    }
  }