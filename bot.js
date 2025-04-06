const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        headless: false,
    }
});

const clientData = {}; // Almacenar los datos de los usuarios

// Conexión a base de datos
mongoose.connect('mongodb+srv://dhnc464:dhnc464@cluster0.ve4qv.mongodb.net/citasSalon?retryWrites=true&w=majority')
  .then(() => console.log('Conectado a MongoDB Atlas'))
  .catch((err) => console.error('Error al conectar a MongoDB Atlas:', err));

const citaSchema = new mongoose.Schema({
    user: String,
    service: String,
    professional: String,
    date: String,
    time: String,
    name: String,
    phone: String,
    createdAt: { type: Date, default: Date.now }
});
const Cita = mongoose.model('Cita', citaSchema);

const servicioSchema = new mongoose.Schema({
    nombreServicio: String,
    duracion: String
});
const Servicios = mongoose.model('Servicios', servicioSchema);

const usuarioSchema = new mongoose.Schema({
    nombre: String,
    servicio: String
});
const Usuarios = mongoose.model('Usuarios', usuarioSchema);

client.on('qr', (qr) => console.log('Escanea este código QR:', qr));
client.on('ready', () => console.log('¡Bot de WhatsApp está listo!'));

client.on('message', async (message) => {
    const chat = await message.getChat();
    if (chat.isGroup) return;

    const user = message.from;

    if (!clientData[user]) {
        clientData[user] = { step: 1 };
        const servicios = await Servicios.find();
        if (servicios.length === 0) {
            message.reply('No hay servicios disponibles en este momento.');
            return;
        }
        const listaServicios = servicios.map((s, i) => `${i + 1}. ${s.nombreServicio}`).join('\n');
        message.reply(`¡Hola! Soy el bot de citas del salón. ¿Qué servicio te gustaría agendar?\n${listaServicios}`);
        clientData[user].servicios = servicios;
        return;
    }

    if (clientData[user].step === 1) {
        const index = parseInt(message.body) - 1;
        if (isNaN(index) || index < 0 || index >= clientData[user].servicios.length) {
            message.reply('Por favor, elige un número de servicio válido.');
            return;
        }

        clientData[user].service = clientData[user].servicios[index].nombreServicio;
        clientData[user].duracion = clientData[user].servicios[index].duracion;

        const NombreServicio = clientData[user].servicios[index].nombreServicio;
        const empleados = await Usuarios.find({ servicio: NombreServicio });
        clientData[user].empleados = empleados.map(e => e.nombre);
        
        if (clientData[user].empleados.length === 0) {
            message.reply('No hay empleados disponibles para este servicio. Por favor, elige otro.');
            delete clientData[user];
            return;
        }
        
        const listaEmpleados = clientData[user].empleados.map((e, i) => `${i + 1}. ${e}`).join('\n');
        clientData[user].step = 2;
        message.reply(`Has elegido ${clientData[user].service}. ¿Qué profesional prefieres?\n${listaEmpleados}`);
        return;
    }

    if (clientData[user].step === 2) {
        const index = parseInt(message.body) - 1;
        if (isNaN(index) || index < 0 || index >= clientData[user].empleados.length) {
            message.reply('Por favor, elige un profesional válido.');
            return;
        }
        clientData[user].professional = clientData[user].empleados[index];
        clientData[user].step = 3;
        message.reply('¡Genial! Ahora elige el día de tu cita (formato: DD/MM/YYYY).');
        return;
    }

    if (clientData[user].step === 3) {
        const day = message.body;
        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!datePattern.test(day)) {
            message.reply('Por favor, ingresa una fecha válida en formato DD/MM/YYYY.');
            return;
        }
        clientData[user].date = day;
        clientData[user].step = 4;
        message.reply('Perfecto. Ahora elige la hora de tu cita (formato: HH:MM).');
        return;
    }

    if (clientData[user].step === 4) {
        const time = message.body;
        const timePattern = /^\d{2}:\d{2}$/;
        if (!timePattern.test(time)) {
            message.reply('Por favor, ingresa una hora válida en formato HH:MM.');
            return;
        }
        clientData[user].time = time;
        clientData[user].step = 5;
        message.reply('¡Todo listo! Por favor, envíame tu nombre completo.');
        return;
    }

    if (clientData[user].step === 5) {
        clientData[user].name = message.body;
        try {
            const cita = new Cita({
                user,
                service: clientData[user].service,
                professional: clientData[user].professional,
                date: clientData[user].date,
                time: clientData[user].time,
                name: clientData[user].name,
                phone: user
            });
            await cita.save();
            message.reply(`¡Gracias ${clientData[user].name}! Tu cita está agendada.`);
            
            // Eliminar los datos del usuario para evitar bucles
            delete clientData[user];

        } catch (err) {
            console.error('Error al guardar la cita:', err);
            message.reply('Hubo un error al guardar tu cita. Intenta de nuevo más tarde.');
        }
    }
});
