const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err) => {
  if (err) {
    console.error('Error conectando a Postgres:', err.message);
  } else {
    console.log('Conectado a la base de datos Postgres (Serverless).');
  }
});

// Crear tabla si no existe
pool.query(`
  CREATE TABLE IF NOT EXISTS briefs (
    id SERIAL PRIMARY KEY,
    clientName TEXT,
    businessName TEXT,
    projectType TEXT,
    description TEXT,
    audience TEXT,
    colors TEXT,
    style TEXT,
    referencesLink TEXT,
    competitors TEXT,
    deadline TEXT,
    budget TEXT,
    attachments TEXT,
    status TEXT DEFAULT 'PENDIENTE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => {
  console.error('Error inicializando tabla briefs:', err.message);
});

// También crearemos la tabla para guardar projects.json en la base de datos
pool.query(`
  CREATE TABLE IF NOT EXISTS portfolio_projects (
    id SERIAL PRIMARY KEY,
    projects_data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => {
  console.error('Error inicializando tabla portfolio_projects:', err.message);
});

module.exports = pool;
