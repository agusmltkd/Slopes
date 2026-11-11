# Traza · cuaderno de esquí

PWA para ver el historial de esquí a partir de los ficheros `.slopes` que exporta la app Slopes.

- Globo con las estaciones donde has esquiado; al entrar, la estación en 3D con todas tus bajadas superpuestas.
- Cada día: traza coloreada por velocidad, repetición de la jornada, perfil de altitud, bajadas, remontes y tarjeta para compartir.
- Estadísticas: temporada contra temporada, récords, logros, reparto del tiempo, velocidades y orientación de las bajadas.
- Fantasma: al repetir un día, tu mejor bajada por el mismo recorrido corre a la vez, con la diferencia en segundos.
- Tramos cronometrados: recortas un trozo de una bajada y la app lo busca en todos tus días, con clasificación y evolución.
- Mapa de velocidad: en cada estación, dónde vas lanzado y dónde frenas.
- Vídeo de temporada: resumen animado vertical de unos 20 segundos para compartir.
- En vivo: tu posición sobre la estación, parte de nieve, cuenta atrás del viaje y avisos de nieve por Telegram (ver `worker/`).
- Retos de temporada con su progreso, que avisan al importar días.
- Comparar dos días cara a cara, con las dos trazas en el mapa y las bajadas repetidas enfrentadas.
- Curvas y pendiente: giros estimados por GPS y velocidad según la pendiente.
- Cobertura: qué pistas de la estación has bajado y cuáles te faltan, según OpenStreetMap.
- Los datos se guardan solo en el dispositivo (IndexedDB). «Añadir días» permite descargar una copia `.zip` y restaurarla.

Sin compilación: HTML, CSS y JS tal cual. MapLibre GL y fflate van incluidos en `vendor/`.

## Publicar

Settings → Pages → Deploy from a branch → `main` / root.

## Probar en local

    python3 -m http.server 8000

## Fuentes de mapa

Imágenes: Esri World Imagery · Topográfico: OpenTopoMap · Pistas: OpenSnowMap · Relieve: AWS Terrain Tiles (Mapzen) · Nombres de pistas: OpenStreetMap (Overpass).
