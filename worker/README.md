# Avisos de nieve por Telegram

Un Worker de Cloudflare que cada mañana mira la previsión de tus estaciones y te escribe por Telegram:

- cuando se esperan X cm o más en los próximos 3 días (X lo eliges en la app; por defecto 20),
- a 7, 3 y 1 día del viaje, con la nieve prevista.

La app le manda la lista de estaciones y la fecha del viaje; tus trazas no salen del móvil.

## Montarlo (una vez, unos 10 minutos)

1. **Bot de Telegram.** Si ya tienes uno (el de «Sobre mí» vale), usa su token. Si no: habla con @BotFather → `/newbot`.
2. **Tu chat id.** Escríbele algo al bot y abre `https://api.telegram.org/bot<TOKEN>/getUpdates`; el número de `chat.id` es el tuyo.
3. **Desplegar** desde esta carpeta:

       npx wrangler login
       npx wrangler kv namespace create TRAZA        # copia el id en wrangler.toml
       npx wrangler secret put TELEGRAM_TOKEN
       npx wrangler secret put TELEGRAM_CHAT_ID
       npx wrangler secret put TRAZA_KEY             # una contraseña que te inventes
       npx wrangler deploy

4. **Conectar la app.** En Traza → En vivo → Avisos de nieve, pega la dirección que te da `wrangler deploy`
   (`https://traza-avisos.<tu-usuario>.workers.dev`) y la `TRAZA_KEY`. Pulsa «Enviar aviso de prueba».

La app vuelve a mandar la lista sola cuando añades días o cambias la fecha del viaje.
