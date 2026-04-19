require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('./db');

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar Cloudinary
cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

// 1. Almacenamiento Cloudinary para "Briefs" (Archivos adjuntos de clientes)
// Permite formatos crudos como PDF, ZIP además de imágenes.
const briefStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'portfolio_briefs',
        resource_type: 'auto'
    }
});
const upload = multer({ storage: briefStorage });

// 2. Almacenamiento Cloudinary para "Proyectos" (Imágenes y Videos del admin)
const projectStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'portfolio_proyectos',
        resource_type: 'auto'
    }
});
const projectUpload = multer({ 
    storage: projectStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: function(req, file, cb) {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes y videos'), false);
        }
    }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname, {
    index: false
}));

// Configuración de Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Rutas de Vistas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index (39).html'));
});

app.get('/brief', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'brief.html'));
});

// --- Rutas de la API (Backend REST) ---

// 1. Crear una nueva ficha (con archivos adjuntos)
app.post('/api/briefs', upload.array('attachments', 10), async (req, res) => {
    try {
        const {
            clientName, businessName, projectType, description, 
            audience, colors, style, referencesLink, competitors, 
            deadline, budget
        } = req.body;

        // Archivos se guardan en Cloudinary, usamos "req.files[i].path" para obtener su URL de nube
        const files = req.files ? req.files.map(file => file.path) : [];
        const attachmentsJson = JSON.stringify(files);

        const query = `
            INSERT INTO briefs (
                clientName, businessName, projectType, description, 
                audience, colors, style, referencesLink, competitors, 
                deadline, budget, attachments
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
        `;
        
        const result = await db.query(query, [
            clientName, businessName, projectType, description, 
            audience, colors, style, referencesLink, competitors, 
            deadline, budget, attachmentsJson
        ]);

        const briefId = result.rows[0].id;

        // Enviar correo de notificación
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_TO || process.env.EMAIL_USER,
            subject: `¡Nueva solicitud de proyecto! - ${clientName || businessName}`,
            text: `Tienes un nuevo brief de ${clientName}.\nProyecto: ${projectType}\nRevisa tu panel de "Fichero" en tu portafolio.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) console.log('Error al enviar correo:', error.message);
            else console.log('Correo de notificación enviado.');
        });

        res.status(201).json({ 
            success: true, 
            message: 'Agradecemos tu tiempo. Ficha enviada con éxito.', 
            id: briefId 
        });
    } catch(err) {
        console.error('Error guardando brief:', err);
        res.status(500).json({ error: 'Error al guardar la ficha' });
    }
});

// 2. Obtener todas las fichas (Para el Panel Admin)
app.get('/api/briefs', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM briefs ORDER BY created_at DESC");
        res.json(result.rows);
    } catch(err) {
        res.status(500).json({ error: 'Error obteniendo fichas' });
    }
});

// 3. Modificar estado de una ficha
app.put('/api/briefs/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        await db.query("UPDATE briefs SET status = $1 WHERE id = $2", [status, req.params.id]);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: 'Error actualizando estado' });
    }
});

// --- Rutas de Proyectos del Portafolio (Persistencia Remota en Postgres) ---
const ADMIN_PASS = process.env.ADMIN_PASS || 'steven2025';

// Helper: Migración (si todavía hay un JSON local, lo pasamos a BD la primera vez)
// Vercel no usa esto porque fs está de solo lectura, pero localmente funciona.
const fs = require('fs');
async function initProjectsDB() {
    try {
        // Vemos si hay un proyecto guardado en DB
        const result = await db.query("SELECT * FROM portfolio_projects LIMIT 1");
        if (result.rows.length === 0) {
            // Intentar leer local
            const localFile = path.join(__dirname, 'projects.json');
            let initialData = [];
            if (fs.existsSync(localFile)) {
                initialData = JSON.parse(fs.readFileSync(localFile, 'utf8'));
            }
            await db.query("INSERT INTO portfolio_projects (projects_data) VALUES ($1)", [JSON.stringify(initialData)]);
            console.log("Migrada información inicial a Postgres.");
        }
    } catch (e) {
        console.error("Error sincronizando initial DB projects:", e.message);
    }
}
// Init DB 
initProjectsDB();

// 4. Obtener todos los proyectos (público) - Lee de Base de datos
app.get('/api/projects', async (req, res) => {
    try {
        const result = await db.query("SELECT projects_data FROM portfolio_projects ORDER BY id DESC LIMIT 1");
        if (result.rows.length > 0) {
            res.json(result.rows[0].projects_data);
        } else {
             // Si por alguna razón está vacía, devuelve el JSON fallback de index.html
            res.json([]);
        }
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Error leyendo proyectos' });
    }
});

// 5. Guardar todos los proyectos (protegido con contraseña)
app.put('/api/projects', async (req, res) => {
    try {
        const { password, projects } = req.body;
        
        if (password !== ADMIN_PASS) {
            return res.status(403).json({ error: 'Contraseña incorrecta' });
        }
        
        if (!Array.isArray(projects)) {
            return res.status(400).json({ error: 'Datos de proyectos inválidos' });
        }

        /* 
         NOTA IMPORTANTE MIGRACIÓN:
         Anteriormente base64 se grababa a disco aquí. Como ahora subimos TODO directo 
         por formdata a Cloudinary, el frontend ya manda puro URL, no hay base64. 
         Si quedara un base64 rezagado, no lo convertiremos al vuelo ya que cloudinary 
         usa APIs externas que tardan. Pero el frontend nuevo (index) se aseguró de no mandar base64.
        */

        // Guardamos el JSON de proyectos actualizado en la base de datos!
        await db.query("DELETE FROM portfolio_projects"); // Limitamos a una fila siempre
        await db.query("INSERT INTO portfolio_projects (projects_data) VALUES ($1)", [JSON.stringify(projects)]);

        console.log(`💾 Proyectos guardados remotamente: ${projects.length} proyectos`);
        res.json({ success: true, count: projects.length });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Error guardando proyectos' });
    }
});

// 6. Subir archivos de proyecto (imágenes/video directos a Cloudinary)
app.post('/api/projects/upload', (req, res) => {
    projectUpload.array('files', 20)(req, res, function(err) {
        if (err) {
            console.error('Error de multer en cloudinary:', err.message);
            return res.status(400).json({ error: err.message });
        }
        
        const { password } = req.body;
        
        if (password !== ADMIN_PASS) {
            return res.status(403).json({ error: 'Contraseña incorrecta' });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se recibieron archivos' });
        }
        
        // Multer-cloudinary nos deja la URL segura subida en `file.path`
        const paths = req.files.map(file => file.path);
        
        console.log(`📁 Alojados en Cloudinary: ${paths.join(', ')}`);
        res.json({ success: true, paths: paths });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Serverless (Node+Postgres) en puerto ${PORT}`);
});
