# Prompt: sitio Artemis II

Quiero crear un sitio web bilingüe (español e inglés) sobre la misión Artemis II de NASA: el despegue, la misión y su trascendencia, y una galería de historias con las fotos que tomó la tripulación. La idea es invitar a la gente a revivir el regreso de los humanos a la Luna.

## Tecnología

- Astro + TypeScript + Tailwind, sitio 100% estático, desplegado en Cloudflare Pages.
- Sin base de datos: el contenido vive en content collections con esquema tipado.
- Componentes de React solo donde haga falta interactividad (los controles de preferencias, por ejemplo).

## Secciones del sitio

1. **Inicio:** una foto o video destacado, una frase de bienvenida y accesos a las demás secciones.
2. **El despegue:** el lanzamiento del cohete SLS con la cápsula Orión desde el Centro Espacial Kennedy. Resume el evento: fecha y hora, cómo fue la cuenta regresiva, las fases del ascenso y qué significó verlo. Incluye fotos del lanzamiento y el video oficial de NASA.
3. **La misión:** un resumen del viaje de unos 10 días, con una línea de tiempo (lanzamiento, inyección translunar, sobrevuelo del lado oculto, eclipse, regreso y amerizaje), la tripulación (Reid Wiseman, Victor Glover, Christina Koch y Jeremy Hansen) y los hitos y récords de la misión.
4. **Por qué importa:** la trascendencia de volver a la Luna con humanos por primera vez desde el Apolo 17 en 1972, lo que significa para el programa Artemis y lo que sigue.
5. **Galería:** las fotos de la tripulación, organizadas por capítulos de la misión.
6. **Acerca de:** fuentes, créditos, pautas de uso de NASA y el aviso sobre el uso de IA.

Todos los datos (fechas, horas, distancias, récords, primeras veces) se verifican en fuentes oficiales antes de publicarlos, con el enlace guardado en los datos. No los tomes de memoria.

## Medios: almacenamiento propio

- Las imágenes no dependen de los servidores de NASA. Se descargan una vez y se sirven desde almacenamiento propio.
- Escribe un script (por ejemplo, `scripts/ingest.ts`) que:
  1. Descargue los originales de las fotos aprobadas, incluidas las del despegue.
  2. Genere variantes optimizadas con sharp (AVIF y WebP en varios anchos, más una miniatura y una imagen Open Graph de 1200×630).
  3. Guarde todo en una estructura ordenada por ID de NASA.
  4. Sea idempotente: si una foto ya está procesada, no la vuelve a descargar.
- Almacenamiento configurable con una variable de entorno (por ejemplo, `MEDIA_BASE_URL`):
  - Desarrollo: sistema de archivos local, fuera del bundle si pesa mucho.
  - Producción: Cloudflare R2. El script debe poder subir a R2.
- Conserva el original en alta resolución en el almacenamiento propio para ofrecer la descarga desde el sitio.
- Cada foto guarda también el enlace al recurso original de NASA y se muestra en la página.
- Video del despegue: inserta el video oficial de NASA con un reproductor ligero que no cargue nada de terceros hasta que el usuario dé clic. Si conviene, guarda en el almacenamiento propio algunos clips cortos o fotogramas para usarlos de portada.

## Fuentes

- Colección Artemis II de la Gateway to Astronaut Photography: https://eol.jsc.nasa.gov/Collections/Artemis/Artemis2/ (categorías Tierra, Luna y eclipse).
- Archivo científico PDS: https://pds-imaging.jpl.nasa.gov/tools/atlas/archive-explorer?mission=artemis2
- Galerías, videos y notas oficiales de NASA sobre el lanzamiento, el sobrevuelo lunar y el regreso.

## Tu papel como curador

- Tú seleccionas las mejores fotos: entre 20 y 30 de la misión y entre 5 y 8 del despegue. Busca impacto visual, variedad y valor histórico (el cohete en la plataforma, el despegue, Earthset y Earthrise, el eclipse total con la corona, la cuenca Oriental, la Vía Láctea, la tripulación en las ventanas, la salida de la Tierra y el regreso).
- Justifica brevemente cada elección en un archivo `CURATION.md`.
- Escribe la historia de una foto solo cuando valga la pena. Ejemplo: cerca de la cuenca Oriental, la tripulación nombró dos cráteres Integrity, por la nave, y Carroll, por la esposa fallecida del comandante Reid Wiseman. Ese tipo de historia cuéntala con respeto y sin dramatizar.
- Cada historia debe basarse en fuentes oficiales o periodísticas confiables, con el enlace guardado en los datos. No inventes datos, fechas ni citas. Si no puedes verificar algo, déjalo fuera.
- Las demás fotos llevan un pie de foto corto y un texto alternativo descriptivo.

## Bilingüe

- Rutas por idioma (`/es/` y `/en/`), con español como idioma por defecto. Detecta el idioma del navegador solo en la primera visita.
- Todo el contenido (secciones, historias, pies de foto y textos alternativos) se escribe en ambos idiomas. El inglés debe sonar natural, no a traducción literal.
- Cambiar de idioma lleva a la misma página en el otro idioma, no a la portada.
- Etiquetas hreflang y Open Graph por idioma.

## Preferencias de visualización

Controles en la barra superior, accesibles y recordados entre visitas (localStorage, con try/catch):

1. **Tema:** claro / oscuro / según el sistema. El oscuro es el predeterminado, porque las fotos del espacio lucen mejor. Sin parpadeo del tema equivocado al cargar.
2. **Idioma:** ES / EN.
3. **Densidad del sitio**, que ajusta espaciado, tamaño de texto y ancho del contenido en todas las páginas:
   - Compacta / Compact: más información por pantalla.
   - Cómoda / Comfortable: el término medio, predeterminado.
   - Amplia / Spacious: más aire y texto más grande, para leer con calma.
4. **Vista de la galería**, independiente de la densidad del sitio y visible solo en las galerías:
   - Mosaico / Mosaic: cuadrícula compacta, muchas fotos a la vista.
   - Galería / Gallery: el término medio, foto con título.
   - Inmersiva / Immersive: una foto a lo ancho con su historia, para leer como un relato.

## Estructura de la galería

- Capítulos por momento de la misión: el despegue, rumbo a la Luna, el lado oculto, el eclipse y el regreso.
- Página por foto con la imagen grande, la historia o pie de foto, la fecha, la cámara si se conoce, el ID original de NASA, el enlace al original y la descarga desde el almacenamiento propio.
- Imágenes Open Graph por foto, para que se vean bien al compartir por WhatsApp.
- Diseño sobrio y centrado en la foto. Responsive y móvil primero, porque la mayoría lo verá desde el celular.

## Aviso sobre el uso de IA

En el pie de página (corto, con enlace) y completo en "Acerca de", en ambos idiomas:

- **ES:** "Este sitio fue creado con ayuda de inteligencia artificial y con las mejores intenciones: compartir la emoción de esta misión. Si algún dato es incorrecto o algún contenido resulta ofensivo, nunca fue esa la intención. Agradecemos que nos lo hagas saber para corregirlo."
- **EN:** "This site was created with the help of artificial intelligence and with the best of intentions: to share the excitement of this mission. If any information is incorrect or any content feels offensive, that was never the intention. Please let us know so we can fix it."
- Incluye un enlace o correo de contacto (déjalo como variable configurable).

## Licencias y créditos

- Cada foto y video lleva "Crédito: NASA" / "Credit: NASA" y el enlace al original.
- No uses el logotipo ni la insignia de NASA, y no sugieras que NASA respalda el sitio.
- Sitio sin publicidad ni venta de productos (las fotos con astronautas tienen restricciones de uso comercial).
- Si alguna foto está marcada con derechos de un tercero, exclúyela.
- En "Acerca de", enlaza las pautas de uso de NASA: https://www.nasa.gov/nasa-brand-center/images-and-media/

## Forma de trabajo

El proyecto avanza por etapas, y cada etapa termina en un pull request. Mi aprobación es fusionar ese PR. Las reglas completas del flujo están en `CLAUDE.md` y el plan de etapas en `docs/PLAN.md`.

Puntos de revisión obligatorios, cada uno en su propio PR:

1. El plan, la estructura del proyecto y el mapa del sitio.
2. La lista de fotos candidatas con sus IDs, antes de descargar imágenes en volumen.
3. Los textos de El despegue, La misión y Por qué importa, con sus fuentes, antes de integrarlos al sitio.

Al final, el build estático debe funcionar en ambos idiomas, con los tres modos de densidad y las tres vistas de galería.

**Hazlo con Astro y despliega en Cloudflare (Pages para el sitio, R2 para los medios).**
