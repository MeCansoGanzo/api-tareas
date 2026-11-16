const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'clave_secreta_api_tareas';

const RUTA_TAREAS = path.join(__dirname, 'tareas.json');
const RUTA_USUARIOS = path.join(__dirname, 'usuarios.json');

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

async function obtenerTareas() {
  try {
    const data = await fs.readFile(RUTA_TAREAS, 'utf8');
    return data.trim() ? JSON.parse(data) : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(RUTA_TAREAS, JSON.stringify([], null, 2));
      return [];
    }
    throw error;
  }
}

async function guardarTareas(tareas) {
  await fs.writeFile(RUTA_TAREAS, JSON.stringify(tareas, null, 2), 'utf8');
}

async function obtenerUsuarios() {
  try {
    const data = await fs.readFile(RUTA_USUARIOS, 'utf8');
    return data.trim() ? JSON.parse(data) : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(RUTA_USUARIOS, JSON.stringify([], null, 2));
      return [];
    }
    throw error;
  }
}

async function guardarUsuarios(usuarios) {
  await fs.writeFile(RUTA_USUARIOS, JSON.stringify(usuarios, null, 2), 'utf8');
}

function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : authHeader;

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado: token no proporcionado' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
}

app.get('/', (req, res) => {
  res.json({ mensaje: 'API de Gestión de Tareas funcionando correctamente' });
});

app.post('/register', async (req, res, next) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({
        error: 'Los campos usuario y password son obligatorios'
      });
    }

    const usuarios = await obtenerUsuarios();
    const existeUsuario = usuarios.find(u => u.usuario === usuario);

    if (existeUsuario) {
      return res.status(400).json({ error: 'El usuario ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const nuevoUsuario = {
      id: Date.now(),
      usuario,
      password: hashedPassword
    };

    usuarios.push(nuevoUsuario);
    await guardarUsuarios(usuarios);

    console.log(`Usuario registrado: ${usuario}`);

    res.status(201).json({
      mensaje: 'Usuario registrado exitosamente',
      usuario: { id: nuevoUsuario.id, usuario: nuevoUsuario.usuario }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/login', async (req, res, next) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({
        error: 'Los campos usuario y password son obligatorios'
      });
    }

    const usuarios = await obtenerUsuarios();
    const user = usuarios.find(u => u.usuario === usuario);

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const passwordValido = await bcrypt.compare(password, user.password);

    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario },
      SECRET_KEY,
      { expiresIn: '1h' }
    );

    console.log(`Inicio de sesión exitoso: ${usuario}`);

    res.json({
      mensaje: 'Inicio de sesión exitoso',
      token
    });
  } catch (error) {
    next(error);
  }
});

app.get('/tareas', autenticarToken, async (req, res, next) => {
  try {
    const tareas = await obtenerTareas();
    res.json(tareas);
  } catch (error) {
    next(error);
  }
});

app.post('/tareas', autenticarToken, async (req, res, next) => {
  try {
    const { titulo, descripcion } = req.body;

    if (!titulo || !descripcion) {
      return res.status(400).json({
        error: 'Los campos titulo y descripcion son obligatorios'
      });
    }

    const tareas = await obtenerTareas();
    const nuevaTarea = {
      id: Date.now(),
      titulo,
      descripcion
    };

    tareas.push(nuevaTarea);
    await guardarTareas(tareas);

    console.log(`Tarea creada con ID: ${nuevaTarea.id}`);

    res.status(201).json({
      mensaje: 'Tarea creada exitosamente',
      tarea: nuevaTarea
    });
  } catch (error) {
    next(error);
  }
});

app.put('/tareas/:id', autenticarToken, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { titulo, descripcion } = req.body;

    if (!titulo && !descripcion) {
      return res.status(400).json({
        error: 'Debes proporcionar al menos titulo o descripcion para actualizar'
      });
    }

    const tareas = await obtenerTareas();
    const indice = tareas.findIndex(t => t.id === id);

    if (indice === -1) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    if (titulo) tareas[indice].titulo = titulo;
    if (descripcion) tareas[indice].descripcion = descripcion;

    await guardarTareas(tareas);

    console.log(`Tarea actualizada con ID: ${id}`);

    res.json({
      mensaje: 'Tarea actualizada exitosamente',
      tarea: tareas[indice]
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/tareas/:id', autenticarToken, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const tareas = await obtenerTareas();
    const indice = tareas.findIndex(t => t.id === id);

    if (indice === -1) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const tareaEliminada = tareas.splice(indice, 1)[0];
    await guardarTareas(tareas);

    console.log(`Tarea eliminada con ID: ${id}`);

    res.json({
      mensaje: 'Tarea eliminada exitosamente',
      tarea: tareaEliminada
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Formato JSON inválido en la petición' });
  }
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    error: err.message || 'Error interno en el servidor'
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});