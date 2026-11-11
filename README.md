# Traza · cuaderno de esquí

PWA para ver el historial de esquí a partir de los ficheros `.slopes` que exporta la app Slopes.

- Globo con las estaciones donde has esquiado; al entrar, la estación en 3D con todas tus bajadas superpuestas.
- Cada día: traza coloreada por velocidad, repetición de la jornada, perfil de altitud, bajadas, remontes y tarjeta para compartir.
- Estadísticas: temporada contra temporada, récords, logros, reparto del tiempo, velocidades y orientación de las bajadas.
- Los datos se guardan solo en el dispositivo (IndexedDB). «Añadir días» permite descargar una copia `.zip` y restaurarla.

Sin compilación: HTML, CSS y JS tal cual. MapLibre GL y fflate van incluidos en `vendor/`.

## Publicar

Settings → Pages → Deploy from a branch → `main` / root.

## Probar en local

    python3 -m http.server 8000

## Fuentes de mapa

Imágenes: Esri World Imagery · Topográfico: OpenTopoMap · Pistas: OpenSnowMap · Relieve: AWS Terrain Tiles (Mapzen) · Nombres de pistas: OpenStreetMap (Overpass).
