# Mapa del sitio (propuesta)

Cada página existe en `/es/…` y `/en/…`; el selector de idioma lleva a la página equivalente. Slugs de sección:

| Sección | ES | EN |
| --- | --- | --- |
| Inicio | `/es/` | `/en/` |
| El despegue | `/es/despegue/` | `/en/launch/` |
| La misión | `/es/mision/` | `/en/mission/` |
| Por qué importa | `/es/por-que-importa/` | `/en/why-it-matters/` |
| Galería | `/es/galeria/` | `/en/gallery/` |
| Capítulo | `/es/galeria/<capitulo>/` | `/en/gallery/<chapter>/` |
| Foto | `/es/galeria/<capitulo>/<id-nasa>/` | `/en/gallery/<chapter>/<id-nasa>/` |
| Acerca de | `/es/acerca/` | `/en/about/` |

Los identificadores de capítulo (en cada idioma): despegue/launch, rumbo-a-la-luna/outbound, lado-oculto/far-side, eclipse/eclipse, regreso/return. El ID de la foto es el mismo en ambos idiomas.

`/` redirige a `/es/` (y, desde la Etapa 02, a `/en/` en la primera visita si el navegador está en inglés).

## Contenido por página

- **Inicio:** foto o video destacado, frase de bienvenida, accesos a las demás secciones.
- **El despegue:** resumen del lanzamiento (fecha y hora, cuenta regresiva, fases del ascenso, qué significó), fotos del despegue y video oficial (carga bajo demanda).
- **La misión:** línea de tiempo (lanzamiento, inyección translunar, sobrevuelo del lado oculto, eclipse, regreso, amerizaje), tripulación (Wiseman, Glover, Koch, Hansen), hitos y récords.
- **Por qué importa:** primer regreso humano a la Luna desde el Apolo 17 (1972), el programa Artemis y lo que sigue.
- **Galería:** capítulos con las vistas Mosaico/Galería/Inmersiva; la vista se elige con el control de la barra superior (solo visible aquí).
- **Foto:** imagen grande, historia o pie, fecha, cámara, ID NASA, enlace al original, descarga, crédito.
- **Acerca de:** fuentes, créditos, pautas de uso de NASA, aviso completo de IA y contacto.

## Todas las páginas

Barra superior con navegación y preferencias (tema, idioma, densidad); pie con crédito a NASA (sin logotipo ni sugerir respaldo) y aviso corto de IA con enlace; hreflang y Open Graph por idioma. Sin publicidad.
