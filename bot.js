const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

const clientData = {}; // Almacenar los datos de los usuarios

// Conexion a base de datos
mongoose.connect('mongodb+srv://dhnc464:dhnc464@cluster0.ve4qv.mongodb.net/citasSalon?retryWrites=true&w=majority')
  .then(() => {
    console.log('Conectado a MongoDB Atlas');
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB Atlas:', err);
  });


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

client.on('qr', (qr) => {
    console.log('Escanea este código QR:', qr);
});

client.on('ready', () => {
    console.log('¡Bot de WhatsApp está listo!');
});

client.on('message', async (message) => {
    const chat = await message.getChat();
    
    // Verifica si el mensaje proviene de un grupo o un chat individual
    if (chat.isGroup) return;

    const user = message.from;

    // Si el usuario no tiene datos almacenados, empieza una nueva cita
    if (!clientData[user]) {
        clientData[user] = { step: 1 }; 
        message.reply('¡Hola! Soy el bot de citas del salón. ¿Qué servicio te gustaría agendar?\n1. Corte Regular\n2. Barba\n3. Uñas');
        return;
    }

    // (elección del servicio)
    if (clientData[user].step === 1) {
        if (message.body === '1') {
            clientData[user].service = 'Corte Regular';
        } else if (message.body === '2') {
            clientData[user].service = 'Barba';
        } else if (message.body === '3') {
            clientData[user].service = 'Uñas';
        } else {
            message.reply('Por favor, elige un servicio válido (1, 2 o 3).');
            return;
        }

        // (elegir profesional)
        clientData[user].step = 2;
        message.reply('Has elegido ' + clientData[user].service + '. ¿Qué profesional prefieres?\n1. Profesional A\n2. Profesional B');
        return;
    }

    // (elección del profesional)
    if (clientData[user].step === 2) {
        if (message.body === '1') {
            clientData[user].professional = 'Profesional A';
        } else if (message.body === '2') {
            clientData[user].professional = 'Profesional B';
        } else {
            message.reply('Por favor, elige un profesional válido (1 o 2).');
            return;
        }

        // (elegir día)
        clientData[user].step = 3;
        message.reply('¡Genial! Ahora elige el día de tu cita (formato: DD/MM/YYYY).');
        return;
    }

    // (elección del día)
    if (clientData[user].step === 3) {
        const day = message.body;
        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;

        if (datePattern.test(day)) {
            clientData[user].date = day;
            clientData[user].step = 4;
            message.reply('Perfecto. Ahora elige la hora de tu cita (formato: HH:MM).');
            return;
        } else {
            message.reply('Por favor, ingresa una fecha válida en formato DD/MM/YYYY.');
            return;
        }
    }

    // (elección de la hora)
    if (clientData[user].step === 4) {
        const time = message.body;
        const timePattern = /^\d{2}:\d{2}$/;

        // Verificar que el formato de la hora sea válido
        if (timePattern.test(time)) {
            // Si el horario es "24:00", se convierte a "00:00"
            if (time === "24:00") {
                message.reply("El horario '24:00' no es válido. Por favor, ingresa un horario entre 00:00 y 23:59.");
                return;
            }

            // Dividir la hora y los minutos
            const [hour, minute] = time.split(":").map(Number);

            // Verificar que la hora esté entre 00:00 y 23:59
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                message.reply("Por favor, ingresa una hora válida entre 00:00 y 23:59.");
                return;
            }

            clientData[user].time = time;
            clientData[user].step = 5;

            try {
                // Verificar disponibilidad del profesional
                const citaExistente = await Cita.findOne({
                    professional: clientData[user].professional,
                    date: clientData[user].date,
                    time: clientData[user].time
                });

                if (citaExistente) {
                    message.reply(`Lo siento, ${clientData[user].professional} ya tiene una cita a las ${clientData[user].time} el ${clientData[user].date}. Por favor, elige otro horario.`);
                    return;
                }

                // Verificar el siguiente intervalo de 30 minutos
                const nextTime = new Date(`1970-01-01T${time}:00Z`); // Crear un objeto de tiempo
                nextTime.setMinutes(nextTime.getMinutes() + 30); // Añadir 30 minutos

                const nextTimeStr = nextTime.toISOString().substr(11, 5); // Convertir a formato HH:MM

                // Verificar si el siguiente intervalo de tiempo está disponible
                const citaNextTime = await Cita.findOne({
                    professional: clientData[user].professional,
                    date: clientData[user].date,
                    time: nextTimeStr
                });

                if (citaNextTime) {
                    message.reply(`Lo siento, el siguiente horario disponible es a las ${nextTimeStr}.`);
                    return;
                }

                message.reply('¡Todo listo! Por favor, envíame tu nombre completo.');
            } catch (err) {
                console.error("Error al verificar la disponibilidad de la cita:", err);
                message.reply("Hubo un error al verificar la disponibilidad. Intenta de nuevo más tarde.");
            }
            return;
        } else {
            message.reply('Por favor, ingresa una hora válida en formato HH:MM.');
            return;
        }
    }

    // (nombre del cliente)
    if (clientData[user].step === 5) {
        clientData[user].name = message.body;
        clientData[user].step = 6;

        try {
            // Guardar la cita en la base de datos
            const cita = new Cita({
                user: user,
                service: clientData[user].service,
                professional: clientData[user].professional,
                date: clientData[user].date,
                time: clientData[user].time,
                name: message.body,
                phone: user // Guardamos el número del usuario
            });

            await cita.save();
            message.reply(`¡Gracias ${message.body}! Tu cita está agendada para el ${clientData[user].date} a las ${clientData[user].time} con ${clientData[user].professional} para el servicio de ${clientData[user].service}.`);
        } catch (err) {
            console.error('Error al guardar la cita:', err);
            message.reply('Hubo un error al guardar tu cita. Intenta de nuevo más tarde.');
        }

        // recordatorio de 24 horas antes de la cita
        setTimeout(async () => {
            // Enviar recordatorio al usuario
            await client.sendMessage(user, `¡Recordatorio! Tu cita está programada para mañana a las ${clientData[user].time}. ¡Nos vemos pronto!`);
        }, 24 * 60 * 60 * 1000); // 24 horas en milisegundos
    }
});

client.initialize();
