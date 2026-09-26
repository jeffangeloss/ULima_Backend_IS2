# Genera el contenido versionado del test de especialidad de ULima++ (RS-BE-37): el JSON de
# src/modules/specialty-test/content/<versión>.json y el documento de revisión
# docs/specialty-test/contenido-<versión>.md. Una versión publicada no cambia; para otra se sube
# VERSION y el archivo nuevo se registra en content/index.ts (decisión abierta 15).
# Valida el balance de los duelos, el largo de cada tarea y calcula los ejemplos numéricos.
import json, itertools, math
from fractions import Fraction as F
from pathlib import Path

OUT = Path(__file__).parent
RAIZ = OUT.parent.parent
VERSION = "2026-09-25.4"
DESTINO_JSON = RAIZ / "src" / "modules" / "specialty-test" / "content" / f"{VERSION}.json"
DESTINO_MD = RAIZ / "docs" / "specialty-test" / f"contenido-{VERSION}.md"
ORDER = ["sw", "ti", "si", "vj"]

# ---------------------------------------------------------------- especialidades (PDF)
E = lambda code, name, short, cr, req, shared=(): dict(code=code, name=name, shortName=short, credits=cr, prerequisite=req, sharedWith=list(shared))
V = "Haber culminado el V ciclo"
SPECIALTIES = [
    dict(key="sw", name="Ingeniería de Software",
         diplomaName="Diploma de Especialidad en Ingeniería de Software",
         color=dict(light="#1E3A8A", dark="#A5C0F7"),
         icon=dict(lucide="code-xml", flutter="LucideIcons.codeXml"),
         tagline="Diseña y programa aplicaciones que funcionan bien y se pueden seguir mejorando.",
         totalCredits=21,
         electives=[
             E("650070", "Paradigmas de Programación", "Paradigmas de Programación", 3, V),
             E("650072", "Análisis y Diseño de Algoritmos", "Análisis y Diseño de Algoritmos", 3, V + " y aprobado Estructuras de Datos II"),
             E("650075", "Deep Learning", "Deep Learning", 3, V + " y aprobado Aprendizaje de Máquina / Machine Learning"),
             E("650030", "Programación Móvil", "Programación Móvil", 3, V + " y aprobado Programación Web", ["vj"]),
             E("650079", "Proyecto de Desarrollo de Software", "Proyecto de Desarrollo de Software", 3, V + " y aprobado Ingeniería de Software II", ["vj"]),
             E("650085", "Arquitectura de Software", "Arquitectura de Software", 3, V),
             E("650011", "Interacción Humano Computadora / Human Computer Interaction", "Interacción Humano Computadora", 3, V, ["vj"]),
         ]),
    dict(key="ti", name="Tecnologías de la Información",
         diplomaName="Diploma de Especialidad en Tecnologías de la Información",
         color=dict(light="#0F7A45", dark="#7EE8BE"),
         icon=dict(lucide="server-cog", flutter="LucideIcons.serverCog"),
         tagline="Mantiene funcionando y protegidas las redes, los servidores y la nube de una organización.",
         totalCredits=21,
         electives=[
             E("650012", "Internet de las Cosas / Internet of Things", "Internet de las Cosas", 3, V),
             E("650073", "Redes Avanzadas", "Redes Avanzadas", 3, V + " y aprobado Redes de Computadoras"),
             E("650077", "Sistemas Distribuidos", "Sistemas Distribuidos", 3, V),
             E("650076", "Tópicos Avanzados en Ciberseguridad", "Tópicos Avanzados en Ciberseguridad", 3, V + " y aprobado Ciberseguridad / Cybersecurity"),
             E("650025", "Computación en la Nube", "Computación en la Nube", 3, V),
             E("650083", "Arquitectura de Tecnologías de la Información", "Arquitectura de TI", 3, V, ["si"]),
             E("650084", "DevOps", "DevOps", 3, V),
         ]),
    dict(key="si", name="Sistemas de Información",
         diplomaName="Diploma de Especialidad en Sistemas de Información",
         color=dict(light="#9333EA", dark="#B98AF8"),
         icon=dict(lucide="chart-column-big", flutter="LucideIcons.chartColumnBig"),
         tagline="Usa los datos de una organización para decidir mejor y cambiar la forma en que trabaja.",
         totalCredits=21,
         electives=[
             E("650071", "Gestión de Base de Datos", "Gestión de Base de Datos", 3, V),
             E("650074", "Ingeniería del Conocimiento", "Ingeniería del Conocimiento", 3, V),
             E("650044", "Analítica con Big Data", "Analítica con Big Data", 3, V + " y aprobado Sistemas de Inteligencia Empresarial"),
             E("650078", "Analítica de Negocios", "Analítica de Negocios", 3, V),
             E("650080", "Innovación Digital", "Innovación Digital", 3, V),
             E("650083", "Arquitectura de Tecnologías de la Información", "Arquitectura de TI", 3, V, ["ti"]),
             E("650082", "Arquitectura Empresarial", "Arquitectura Empresarial", 3, V + " y aprobado Planeamiento Estratégico"),
         ]),
    dict(key="vj", name="Desarrollo de Videojuegos",
         diplomaName="Diploma de Especialidad en Desarrollo de Videojuegos",
         color=dict(light="#76164A", dark="#EC7FB3"),
         icon=dict(lucide="gamepad-2", flutter="LucideIcons.gamepad2"),
         tagline="Crea videojuegos, desde la historia y las reglas hasta la programación y las pruebas con jugadores.",
         totalCredits=23,
         electives=[
             E("550001", "Storytelling", "Storytelling", 3, "Sin requisito"),
             E("550090", "Diseño de Videojuegos", "Diseño de Videojuegos", 5, "Aprobado Storytelling"),
             E("550029", "Narrativa Gráfica", "Narrativa Gráfica", 3, "Aprobado Storytelling"),
             E("650030", "Programación Móvil", "Programación Móvil", 3, V + " y aprobado Programación Web", ["sw"]),
             E("650079", "Proyecto de Desarrollo de Software", "Proyecto de Desarrollo de Software", 3, V + " y aprobado Ingeniería de Software II", ["sw"]),
             E("650081", "Proyecto de Videojuegos", "Proyecto de Videojuegos", 3, V),
             E("650011", "Interacción Humano Computadora / Human Computer Interaction", "Interacción Humano Computadora", 3, V, ["sw"]),
         ]),
]
SP = {s["key"]: s for s in SPECIALTIES}
ELECTIVE_NAME = {e["code"]: e["shortName"] for s in SPECIALTIES for e in s["electives"]}

# Íconos válidos de lucide_icons_flutter 3.1.15, extraídos con extraer-lucide.py: nombre de Lucide,
# constante de LucideIcons y punto de código del glifo (dos nombres con el mismo punto son alias).
LUCIDE = {}
for linea in (OUT / "lucide-nombres.txt").read_text(encoding="utf-8").splitlines():
    if linea and not linea.startswith("#"):
        nombre, constante, glifo = linea.split("\t")
        LUCIDE[nombre] = (constante, int(glifo))

def lucide_icon(name):
    """Mismo formato que el ícono de especialidad, {lucide, flutter}."""
    parts = name.split("-")
    return dict(lucide=name, flutter="LucideIcons." + parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:]))

def T(sp, electives, text, summary, illustration, icon):
    # icon es el nombre de Lucide de un ícono que representa la tarea concreta, no la especialidad.
    return dict(specialty=sp, text=text, summary=summary, illustration=illustration, icon=lucide_icon(icon), electives=electives)

# ---------------------------------------------------------------- preguntas
DUEL_PROMPT = "¿Cuál harías con más ganas?"
SCALE_PROMPT = "¿Cuánto te gustaría hacer esto?"

QUESTIONS = [
    # Orden revisado el 2026-09-25: ninguna especialidad sale en tres ítems seguidos, ninguna escala
    # queda junto a un duelo de su misma especialidad y ninguna especialidad sale más de dos veces
    # seguidas en el mismo lado. Las reacciones van por posición, no por contenido.
    dict(n=1, type="duel",
         top=T("sw", ["650030"], "Programar la app con la que una bodega recibe pedidos del barrio",
               "programar la app de pedidos de una bodega",
               "Celular con la app de una bodega abierta, un carrito con arroz y gaseosa, y la bodega de esquina al fondo.", "shopping-cart"),
         bottom=T("si", ["650078"], "Revisar las ventas de una bodega para decidir qué productos conviene reponer",
                  "decidir con las ventas qué reponer en una bodega",
                  "Estante de bodega con un gráfico de barras encima y una flecha que marca el producto que más sale.", "shelving-unit"),
         reaction="Arrancamos por el barrio. Sigue eligiendo lo que harías con ganas, no lo que suena más serio."),
    dict(n=2, type="duel",
         top=T("ti", ["650012"], "Conectar sensores que avisen al celular si la refrigeradora de una botica se calienta",
               "vigilar con sensores la refrigeradora de una botica",
               "Refrigeradora de botica con un sensor pequeño pegado a la puerta y un celular que muestra una alerta de temperatura.", "refrigerator"),
         bottom=T("vj", ["650081", "550090"], "Diseñar los niveles de un juego para que se pongan difíciles poco a poco",
                  "diseñar niveles que se ponen difíciles poco a poco",
                  "Cinco niveles de un juego dibujados como escalones, con obstáculos que crecen en cada uno.", "mountain"),
         reaction="Anotado. Yo me quedo mirando cualquier cosa que brille, cosas de cuervo."),
    dict(n=3, type="duel",
         top=T("vj", ["550090", "650011"], "Observar a jugadores probando un juego y anotar dónde se traban o aburren",
               "observar a jugadores probando un juego",
               "Dos jóvenes jugando con un mando mientras una persona detrás toma notas.", "eye"),
         bottom=T("si", ["650080"], "Planear cómo un mercado de abastos vende por internet sin perder a sus caseros",
                  "planear la venta por internet de un mercado",
                  "Puesto de mercado con su casera atendiendo y, al lado, un celular con la tienda del mercado.", "store"),
         reaction="Ya. Aquí no hay respuestas buenas ni malas, solo las tuyas."),
    dict(n=4, type="scale",
         task=T("ti", ["650025"], "Pasar a la nube los sistemas de diez pollerías sin cortar la atención",
                "pasar a la nube los sistemas de diez pollerías",
                "Local de pollería atendiendo normal mientras sus datos suben a una nube dibujada sobre el techo.", "drumstick"),
         blockClose="Primer tramo listo. Van 4 de 14."),
    dict(n=5, type="duel",
         top=T("vj", ["650081"], "Programar cómo salta y choca un personaje en un juego de plataformas",
               "programar cómo salta un personaje de juego",
               "Personaje de juego en pleno salto entre dos plataformas, con la curva del salto marcada.", "rabbit"),
         bottom=T("sw", ["650075"], "Entrenar un programa que reconozca en fotos si una palta está madura",
                  "entrenar un programa que reconoce paltas maduras",
                  "Celular que fotografía tres paltas y marca con un check la que está lista.", "camera"),
         reaction="Esa estaba reñida. Sigamos."),
    dict(n=6, type="duel",
         top=T("si", ["650071"], "Organizar los datos de una clínica para encontrar cualquier historia clínica en segundos",
               "ordenar los datos de una clínica",
               "Recepción de clínica con una pantalla que encuentra una ficha entre miles de carpetas ordenadas.", "folder-search"),
         bottom=T("ti", ["650073"], "Diseñar el wifi de un colegio para que todas las aulas tengan buena señal",
                  "diseñar el wifi de un colegio",
                  "Plano de un colegio con antenas de wifi y ondas que cubren todas las aulas.", "school"),
         reaction="¡Cra! Ya voy entendiendo por dónde vuelas."),
    dict(n=7, type="duel",
         top=T("sw", ["650085"], "Hacer el plano de una app grande antes de que el equipo la programe",
               "hacer el plano de una app grande",
               "Plano azul de arquitecto con las piezas de una app unidas por flechas.", "drafting-compass"),
         bottom=T("ti", ["650084"], "Automatizar que cada versión nueva de una app se pruebe y se publique sola",
                  "automatizar las pruebas y la publicación de una app",
                  "Cinta transportadora por la que pasan versiones de una app, cada una con un check de prueba antes de salir.", "rocket"),
         reaction="Lo apunto en mi libreta."),
    dict(n=8, type="scale",
         task=T("vj", ["650081", "650030"], "Programar un juego sencillo para celular que se juegue con una mano",
                "programar un juego sencillo para celular",
                "Mano que sostiene un celular y juega con el pulgar un juego de colores simples.", "smartphone"),
         blockClose="Ya pasaste la mitad. Recuerda que mido tus ganas, no tus notas."),
    dict(n=9, type="duel",
         top=T("si", ["650074"], "Convertir lo que sabe un asesor de créditos en reglas para evaluar préstamos",
               "convertir lo que sabe un asesor de créditos en reglas",
               "Asesor de créditos que conversa mientras sus ideas pasan a una lista de reglas con flechas de sí y no.", "hand-coins"),
         bottom=T("sw", ["650011"], "Probar con usuarios si la app de un banco se entiende a la primera",
                  "probar con usuarios si una app se entiende",
                  "Persona que usa la app de un banco mientras alguien a su lado anota en un portapapeles.", "clipboard-pen-line"),
         reaction="Tranqui, nada de esto te amarra a una especialidad."),
    dict(n=10, type="duel",
         top=T("ti", ["650077"], "Evitar que la web de entradas de un concierto se caiga cuando todos compran",
               "evitar que la web de un concierto se caiga",
               "Fila enorme de personas frente a una web de entradas, sostenida por varios servidores que se reparten la carga.", "ticket"),
         bottom=T("si", ["650044"], "Analizar millones de viajes del Metropolitano para saber a qué hora se llena",
                  "analizar millones de viajes en bus",
                  "Bus articulado sin logos junto a un gráfico de horas con un pico marcado en la hora punta.", "clock-arrow-up"),
         reaction="Vas volando. Quedan pocas."),
    dict(n=11, type="duel",
         top=T("sw", ["650072"], "Programar el cálculo de la ruta más corta para un repartidor de delivery",
               "calcular la ruta más corta de un repartidor",
               "Mapa de un distrito con cinco puntos de entrega unidos por una sola línea y una moto de delivery.", "route"),
         bottom=T("vj", ["550001"], "Escribir la historia y los diálogos de los personajes de un juego",
                  "escribir la historia y los diálogos de un juego",
                  "Cuaderno abierto con globos de diálogo y dos personajes de juego que conversan.", "messages-square"),
         reaction="Una más al bolsillo."),
    dict(n=12, type="scale",
         task=T("si", ["650078"], "Descubrir con datos qué clientes de una tienda están por dejar de comprar",
                "descubrir qué clientes están por dejar de comprar",
                "Tarjetas de clientes en una pantalla, algunas marcadas en amarillo, y un gráfico que baja.", "user-minus"),
         blockClose="Te quedan dos. Ya casi te cuento lo que vi."),
    dict(n=13, type="duel",
         top=T("vj", ["550029"], "Dibujar en viñetas cómo avanza la historia de un juego antes de programarlo",
               "dibujar en viñetas la historia de un juego",
               "Hoja con seis viñetas dibujadas a lápiz que cuentan una escena de juego.", "pencil"),
         bottom=T("ti", ["650076"], "Averiguar por dónde se coló un atacante en el sistema de una municipalidad",
                  "averiguar por dónde se coló un atacante",
                  "Muro digital de ladrillos con una grieta ya abierta y una lupa que sigue las huellas que entran por ella.", "footprints"),
         reaction="Ahora sí viene la recta final."),
    dict(n=14, type="scale",
         task=T("sw", ["650030"], "Programar una app que avise cuándo pasa el bus por tu paradero",
                "programar una app que avisa cuándo pasa el bus",
                "Paradero con una persona que mira su celular, donde una app muestra el bus a dos cuadras.", "bus"),
         blockClose="¡Listo, terminaste las 14!"),
]

# ---------------------------------------------------------------- desempates (2 por par)
TIEBREAKERS = [
    dict(pair=["sw", "ti"], order=1,
         top=T("sw", ["650079"], "Programar el sistema de citas de una clínica para que no se crucen horarios",
               "programar el sistema de citas de una clínica",
               "Agenda en pantalla con citas de colores que encajan sin chocar.", "calendar-clock"),
         bottom=T("ti", ["650083"], "Elegir los servidores y la red que necesita una clínica nueva",
                  "elegir los servidores y la red de una clínica",
                  "Cuarto pequeño con un rack de servidores y cables que salen hacia los consultorios.", "hospital")),
    dict(pair=["sw", "ti"], order=2,
         top=T("ti", ["650076"], "Cuidar que nadie entre a las cuentas de un banco con claves robadas",
               "proteger las cuentas de un banco contra claves robadas",
               "Candado grande sobre una tarjeta bancaria genérica y una clave tachada.", "key-round"),
         bottom=T("sw", ["650075"], "Entrenar un programa que lea boletas escritas a mano y sume los montos",
                  "entrenar un programa que lee boletas escritas a mano",
                  "Boleta escrita a mano junto a un celular que muestra el total ya sumado.", "receipt")),
    dict(pair=["sw", "si"], order=1,
         top=T("sw", ["650085", "650070"], "Ordenar el código de una app vieja para que sea fácil de cambiar",
               "ordenar el código de una app vieja",
               "Pantalla con líneas de código enredadas al lado de la misma pantalla con el código separado en bloques ordenados.", "blocks"),
         bottom=T("si", ["650082"], "Revisar qué programas necesita cada área de una empresa para cumplir sus metas",
                  "revisar qué programas necesita cada área de una empresa",
                  "Organigrama simple con un ícono de programa junto a cada área y una bandera de meta arriba.", "goal")),
    dict(pair=["sw", "si"], order=2,
         top=T("si", ["650071"], "Unir en una sola base de datos las ventas de todas las sedes",
               "unir en una base de datos las ventas de todas las sedes",
               "Varias tiendas pequeñas con flechas que llegan a un solo cilindro de base de datos.", "database"),
         bottom=T("sw", ["650011"], "Diseñar una app que un adulto mayor pueda usar sin pedir ayuda",
                  "diseñar una app que un adulto mayor usa sin ayuda",
                  "Señora mayor que usa sola un celular con botones grandes y claros.", "rocking-chair")),
    dict(pair=["sw", "vj"], order=1,
         top=T("sw", ["650072"], "Programar cómo se reparten las canchas de fulbito para que no se crucen reservas",
               "programar el reparto de reservas de canchas de fulbito",
               "Cancha de fulbito vista desde arriba junto a un calendario con turnos que no se cruzan.", "land-plot"),
         bottom=T("vj", ["550090"], "Crear las reglas de un juego de mesa y probarlas con amigos",
                  "crear las reglas de un juego de mesa",
                  "Tablero de cartón con fichas, cartas y dados hechos a mano, y un grupo de amigos que juega alrededor.", "dices")),
    dict(pair=["sw", "vj"], order=2,
         top=T("vj", ["650081"], "Programar la inteligencia de los enemigos para que persigan al jugador",
               "programar cómo los enemigos persiguen al jugador",
               "Laberinto de juego con tres enemigos que siguen flechas hacia el personaje.", "ghost"),
         bottom=T("sw", ["650075"], "Entrenar un programa que recomiende canciones según lo que ya escuchaste",
                  "entrenar un programa que recomienda canciones",
                  "Audífonos junto a una lista de canciones con una recomendación resaltada.", "headphones")),
    dict(pair=["ti", "si"], order=1,
         top=T("ti", ["650076"], "Detectar a un intruso en la red de una cadena de boticas y echarlo",
               "detectar a un intruso en la red de una cadena de boticas",
               "Botica con su red dibujada encima, una alerta sobre una silueta sin rostro y una puerta que se le cierra.", "siren"),
         bottom=T("si", ["650078"], "Medir con datos si la promoción de una botica de verdad vendió más",
                  "medir si una promoción de verdad vendió más",
                  "Cartel de oferta en una botica junto a dos barras, antes y después de la promoción.", "badge-percent")),
    dict(pair=["ti", "si"], order=2,
         top=T("si", ["650080"], "Rediseñar los trámites de una municipalidad para que se hagan por internet sin colas",
               "rediseñar los trámites de una municipalidad",
               "Ventanilla municipal con una fila que se acorta porque la gente hace el trámite desde su celular.", "stamp")),
]
TIEBREAKERS[-1]["bottom"] = T("ti", ["650077", "650025"], "Hacer que los servidores de una universidad aguanten la matrícula sin caerse",
                              "hacer que los servidores aguanten la matrícula",
                              "Reloj que marca la hora de la matrícula y varios servidores que resisten una ola de usuarios.", "graduation-cap")
TIEBREAKERS += [
    dict(pair=["ti", "vj"], order=1,
         top=T("ti", ["650012"], "Conectar las luces y cámaras de una casa para manejarlas desde el celular",
               "conectar las luces y cámaras de una casa al celular",
               "Casa en corte con focos y una cámara unidos por líneas punteadas a un celular.", "house-wifi"),
         bottom=T("vj", ["550001"], "Inventar un personaje de juego con su historia, sus miedos y sus metas",
                  "inventar un personaje con su historia",
                  "Ficha de personaje con su silueta, tres notas pegadas y una línea de tiempo corta.", "drama")),
    dict(pair=["ti", "vj"], order=2,
         top=T("vj", ["550090"], "Diseñar un juego que enseñe a los niños a cuidar el agua",
               "diseñar un juego que enseña a cuidar el agua",
               "Niña que juega en una tablet a cerrar caños que gotean dentro del juego.", "droplet")),
    dict(pair=["si", "vj"], order=1,
         top=T("si", ["650044"], "Descubrir con datos qué platos se piden más en cada distrito de Lima",
               "descubrir qué platos se piden más por distrito",
               "Mapa de Lima por distritos con un plato distinto dibujado sobre cada uno.", "soup"),
         bottom=T("vj", ["550090"], "Diseñar las misiones de un juego ambientado en el Centro de Lima",
                  "diseñar misiones de un juego en el Centro de Lima",
                  "Plaza con balcones de estilo colonial convertida en mapa de juego con marcadores de misión.", "map-pinned")),
    dict(pair=["si", "vj"], order=2,
         top=T("vj", ["550001"], "Escribir los finales distintos de un juego según lo que decida el jugador",
               "escribir finales distintos según lo que decide el jugador",
               "Camino que se abre en tres ramas, cada una con un final dibujado distinto.", "split"),
         bottom=T("si", ["650074"], "Recopilar los trucos de los boticarios veteranos en un buscador para todo el equipo",
                  "recopilar los trucos de los boticarios veteranos",
                  "Mostrador de botica donde un boticario mayor comparte consejos en burbujas que pasan a un buscador abierto en la tablet de dos colegas.", "pill-bottle")),
]
TIEBREAKERS[-3]["bottom"] = T("ti", ["650073"], "Montar la red y el wifi de un evento para cinco mil personas",
                              "montar la red de un evento para cinco mil personas",
                              "Explanada llena de gente con antenas de wifi en postes y ondas que la cubren.", "radio-tower")

# ---------------------------------------------------------------- ids y validación
for q in QUESTIONS:
    q["id"] = f"q{q['n']:02d}"
    q["block"] = 1 + (q["n"] - 1) // 4 if q["n"] <= 12 else 4
    q["prompt"] = DUEL_PROMPT if q["type"] == "duel" else SCALE_PROMPT
    if q["type"] == "duel":
        q["pair"] = sorted([q["top"]["specialty"], q["bottom"]["specialty"]], key=ORDER.index)
for tb in TIEBREAKERS:
    tb["pair"] = sorted(tb["pair"], key=ORDER.index)
    tb["id"] = f"tb-{tb['pair'][0]}-{tb['pair'][1]}-{tb['order']}"
    tb["prompt"] = DUEL_PROMPT

errors = []
def words(t): return len(t.split())
def all_tasks():
    for q in QUESTIONS:
        if q["type"] == "duel":
            yield q["id"], q["top"]; yield q["id"], q["bottom"]
        else:
            yield q["id"], q["task"]
    for tb in TIEBREAKERS:
        yield tb["id"], tb["top"]; yield tb["id"], tb["bottom"]

texts = set()
for qid, t in all_tasks():
    w = words(t["text"])
    t["wordCount"] = w
    if not 6 <= w <= 14: errors.append(f"{qid}: {w} palabras en «{t['text']}»")
    if t["text"] in texts: errors.append(f"{qid}: tarea repetida")
    texts.add(t["text"])
    for c in t["electives"]:
        if c not in [e["code"] for e in SP[t["specialty"]]["electives"]]:
            errors.append(f"{qid}: {c} no es electivo de {t['specialty']}")
    for bad in ["—", "–", ":"]:
        if bad in t["text"] or bad in t["summary"]: errors.append(f"{qid}: signo {bad}")

duels = [q for q in QUESTIONS if q["type"] == "duel"]
scales = [q for q in QUESTIONS if q["type"] == "scale"]
assert [q["n"] for q in scales] == [4, 8, 12, 14]
assert len(duels) == 10 and len(QUESTIONS) == 14
app = {k: 0 for k in ORDER}; top = {k: 0 for k in ORDER}
pairs = {}
for q in duels:
    a, b = q["top"]["specialty"], q["bottom"]["specialty"]
    if a == b: errors.append(f"{q['id']}: misma especialidad")
    app[a] += 1; app[b] += 1; top[a] += 1
    pairs.setdefault(tuple(q["pair"]), []).append(q)
if any(v != 5 for v in app.values()): errors.append(f"apariciones {app}")
if set(pairs) != set(itertools.combinations(ORDER, 2)): errors.append("faltan pares")
for p, qs in pairs.items():
    if len(qs) not in (1, 2): errors.append(f"par {p} aparece {len(qs)}")
    if len(qs) == 2 and qs[0]["top"]["specialty"] == qs[1]["top"]["specialty"]:
        errors.append(f"par {p} no alterna arriba/abajo")
if any(v not in (2, 3) for v in top.values()): errors.append(f"arriba {top}")
if sorted(q["task"]["specialty"] for q in scales) != sorted(ORDER): errors.append("escalas")
tbp = {}
for tb in TIEBREAKERS:
    tbp.setdefault(tuple(tb["pair"]), []).append(tb)
    if tb["top"]["specialty"] == tb["bottom"]["specialty"]: errors.append(tb["id"])
for p in itertools.combinations(ORDER, 2):
    tbs = tbp.get(p, [])
    if len(tbs) < 2: errors.append(f"desempate {p}: {len(tbs)}")
    elif tbs[0]["top"]["specialty"] == tbs[1]["top"]["specialty"]: errors.append(f"desempate {p} no alterna")
# electivos compartidos no pueden representar a una especialidad frente a la otra que lo comparte
shared = {e["code"]: set(e["sharedWith"]) for s in SPECIALTIES for e in s["electives"] if e["sharedWith"]}
for item in duels + TIEBREAKERS:
    for side, other in (("top", "bottom"), ("bottom", "top")):
        for c in item[side]["electives"]:
            if item[other]["specialty"] in shared.get(c, set()):
                errors.append(f"{item['id']}: {c} es compartido con el rival")
# orden: ninguna especialidad en tres ítems seguidos, ninguna escala junto a un duelo de su misma
# especialidad y ninguna especialidad más de dos veces seguidas en el mismo lado
def specs(q):
    return {q["top"]["specialty"], q["bottom"]["specialty"]} if q["type"] == "duel" else {q["task"]["specialty"]}
for a, b in zip(QUESTIONS, QUESTIONS[1:]):
    if (a["type"] == "scale" or b["type"] == "scale") and specs(a) & specs(b):
        errors.append(f"{a['id']}-{b['id']}: escala junto a un duelo de su especialidad")
for a, b, c in zip(QUESTIONS, QUESTIONS[1:], QUESTIONS[2:]):
    if specs(a) & specs(b) & specs(c):
        errors.append(f"{a['id']}-{c['id']}: una especialidad en tres ítems seguidos")
sides = {k: "" for k in ORDER}
for q in duels:
    sides[q["top"]["specialty"]] += "A"; sides[q["bottom"]["specialty"]] += "B"
if any("AAA" in v or "BBB" in v for v in sides.values()):
    errors.append(f"lados {sides}")
adjacent_shared = sum(len(specs(a) & specs(b)) for a, b in zip(QUESTIONS, QUESTIONS[1:]))
# íconos: cada uno existe en lucide_icons_flutter 3.1.15 con su constante, ninguna tarea usa el ícono
# de una especialidad, las dos tareas de un duelo o desempate no comparten glifo y ningún glifo se
# repite en el test (se compara el punto de código, así que un alias cuenta como el mismo ícono)
def glyph(icon, where):
    lucide = icon.get("lucide"); const = LUCIDE.get(lucide, (None,))[0]
    if const is None:
        errors.append(f"{where}: el ícono «{lucide}» no existe en lucide_icons_flutter 3.1.15"); return None
    if icon.get("flutter") != "LucideIcons." + const:
        errors.append(f"{where}: {icon.get('flutter')} no es la constante de «{lucide}» (LucideIcons.{const})"); return None
    return LUCIDE[lucide][1]
specialty_glyphs = {glyph(s["icon"], s["key"]): s["key"] for s in SPECIALTIES}
task_glyphs = {}
for qid, t in all_tasks():
    g = glyph(t.get("icon") or {}, qid)
    if g is None: continue
    if g in specialty_glyphs:
        errors.append(f"{qid}: «{t['icon']['lucide']}» es el ícono de la especialidad {specialty_glyphs[g]}")
    if g in task_glyphs:
        errors.append(f"{qid}: «{t['icon']['lucide']}» repite el glifo de {task_glyphs[g]}")
    task_glyphs.setdefault(g, qid)
for item in duels + TIEBREAKERS:
    a, b = (LUCIDE.get(item[side]["icon"]["lucide"]) for side in ("top", "bottom"))
    if a and b and a[1] == b[1]:
        errors.append(f"{item['id']}: las dos tareas usan el mismo ícono")
if errors:
    print("\n".join(errors)); raise SystemExit(1)

# ---------------------------------------------------------------- puntaje
SCALE_OPTIONS = [
    dict(id="nada", label="Nada", value=0),
    dict(id="un_poco", label="Un poco", value=1),
    dict(id="bastante", label="Bastante", value=2),
    dict(id="me_encantaria", label="Me encantaría", value=3),
]
SCALE_VALUE = {o["id"]: o["value"] for o in SCALE_OPTIONS}
SCALE_LABEL = {o["id"]: o["label"] for o in SCALE_OPTIONS}
TOL = F(1, 10**9)

def affinity(h, n, e):
    """h = medios puntos, n = duelos mostrados, e = valor de escala. A = 35h/n + 10e."""
    return F(35 * h, n) + 10 * e

def score(answers, tb_answers=()):
    """answers: {n: 'top'|'bottom'|'both'|'none'|scale_id}. tb_answers: [(tb, answer)]."""
    h = {k: 0 for k in ORDER}; n = {k: 0 for k in ORDER}; e = {}
    won = {k: [] for k in ORDER}
    for q in QUESTIONS:
        a = answers[q["n"]]
        if q["type"] == "scale":
            e[q["task"]["specialty"]] = SCALE_VALUE[a]; continue
        for side in ("top", "bottom"):
            s = q[side]["specialty"]; n[s] += 1
            if a == side: h[s] += 2; won[s].append((0, q["n"], q[side]))
            elif a == "both": h[s] += 1; won[s].append((1, q["n"], q[side]))
    for tb, a in tb_answers:
        for side in ("top", "bottom"):
            s = tb[side]["specialty"]; n[s] += 1
            if a == side: h[s] += 2
            elif a == "both": h[s] += 1
    A = {k: affinity(h[k], n[k], e[k]) for k in ORDER}
    return dict(h=h, n=n, e=e, A=A, won=won)

def rank(sc):
    D = {k: F(50 * sc["h"][k], sc["n"][k]) for k in ORDER}
    return sorted(ORDER, key=lambda k: (-sc["A"][k], -D[k], -sc["e"][k], ORDER.index(k)))

def fmt_num(x, dec=2):
    x = float(x)
    if abs(x - round(x)) < 1e-9: return str(int(round(x)))
    return f"{x:.{dec}f}".rstrip("0").replace(".", ",")

def fmt_points(h):
    return fmt_num(F(h, 2), 1)

def run_example(answers, tb_script):
    """tb_script: lista de respuestas para los desempates en orden."""
    trace = []
    sc = score(answers)
    order = rank(sc)
    trace.append(dict(stage="tras la pregunta 14", affinity={k: fmt_num(sc["A"][k]) for k in ORDER},
                      duelPoints={k: fmt_points(sc["h"][k]) + "/" + str(sc["n"][k]) for k in ORDER},
                      scale={k: sc["e"][k] for k in ORDER}, ranking=order))
    first, second = order[0], order[1]
    tb_done = []
    pair = sorted([first, second], key=ORDER.index)
    decided_by_tb = False
    for i in (1, 2):
        cur = score(answers, tb_done)
        gap = abs(cur["A"][first] - cur["A"][second])
        if gap > 10 + TOL: break
        tb = next(t for t in TIEBREAKERS if t["pair"] == pair and t["order"] == i)
        ans = tb_script[i - 1]
        tb_done.append((tb, ans))
        decided_by_tb = True
        cur = score(answers, tb_done)
        trace.append(dict(stage=f"desempate {i} ({tb['id']}), respuesta {ans}",
                          affinity={k: fmt_num(cur["A"][k]) for k in pair},
                          duelPoints={k: fmt_points(cur["h"][k]) + "/" + str(cur["n"][k]) for k in pair},
                          gap=fmt_num(abs(cur["A"][first] - cur["A"][second]))))
    final = score(answers, tb_done)
    order = rank(final)
    tie = abs(final["A"][order[0]] - final["A"][order[1]]) < TOL
    return final, order, tb_done, decided_by_tb, tie, trace

# ---------------------------------------------------------------- motivos sin IA
REASONS = dict(
    variables={
        "{nombre}": "Nombre oficial de la especialidad ganadora.",
        "{afinidad}": "Afinidad de la ganadora redondeada a entero (sin el signo %; la plantilla lo agrega).",
        "{puntos}": "Puntos de duelo de la ganadora con coma decimal, como «4» o «3,5».",
        "{duelos}": "Duelos en los que apareció la ganadora, contando desempates (5, 6 o 7).",
        "{tareas}": "Hasta dos resúmenes de tareas de la ganadora que el alumno eligió en duelos principales. Primero las que ganó sola, en orden de pregunta; después las de «Me gustan las dos». Se unen con « y ».",
        "{escalaTarea}": "Resumen de la tarea de la escala de la ganadora.",
        "{escalaRespuesta}": "Etiqueta que eligió en esa escala (Nada, Un poco, Bastante o Me encantaría).",
        "{rival}": "La otra especialidad del desempate.",
        "{tareaDesempate}": "Resumen de la última tarea de desempate que eligió sola y que era de la ganadora; vacío si no la hay.",
        "{segunda}": "Nombre de la segunda especialidad.",
        "{afinidadSegunda}": "Afinidad de la segunda redondeada a entero.",
        "{electivos}": "Nombres cortos, entre comillas latinas, del primer electivo de cada tarea de {tareas}, sin repetir, unidos con « y ».",
        "{a}, {b}, {puntosA}, {duelosA}, {puntosB}, {duelosB}": "Solo para el empate final. Son las dos especialidades y sus puntos y duelos.",
    },
    derived={
        "A": "Afinidad de la ganadora, sin redondear.",
        "D": "Porcentaje de duelos de la ganadora (100 · puntos / duelos).",
        "e": "Valor de la escala de la ganadora (0 a 3).",
        "A2": "Afinidad de la segunda, sin redondear.",
        "tareas": "Valor de {tareas}; queda vacío solo si la ganadora no sumó nada en los 10 duelos de las 14 preguntas.",
        "huboDesempate": "Se mostró al menos un desempate.",
        "ganadoraEnElPar": "La ganadora es una de las dos especialidades del desempate.",
        "empate": "Las dos primeras terminaron con la misma afinidad exacta.",
    },
    compose=["main", "tiebreak", "second", "electives"],
    composeRule="Se toma la primera plantilla de «main» cuya condición se cumpla. Luego se agregan, en este orden y solo si su condición se cumple, una de «tiebreak», la de «second» y la de «electives». Las oraciones se unen con un espacio. Si el resultado es empate, se usa solo «tie».",
    main=[
        dict(id="low", when="A < 50",
             text="Ninguna especialidad te llamó con fuerza, y eso también es información. {nombre} quedó arriba con {afinidad} %, así que es un buen punto de partida para mirar cursos sin apuro."),
        dict(id="noMainPoints", when="tareas == ''",
             text="En las 14 preguntas, {nombre} no sumó puntos en los duelos. La pusieron arriba tu «{escalaRespuesta}» a la idea de {escalaTarea} y lo que elegiste en los desempates."),
        dict(id="strong", when="D >= 80 && e >= 2",
             text="En los duelos, {nombre} sumó {puntos} de {duelos} puntos, con tareas como {tareas}. Y a la idea de {escalaTarea} le dijiste «{escalaRespuesta}». Todo apunta para el mismo lado."),
        dict(id="duelsOverScale", when="D >= 60 && e <= 1",
             text="En los duelos, {nombre} sumó {puntos} de {duelos} puntos, con tareas como {tareas}, pero a la idea de {escalaTarea} le dijiste «{escalaRespuesta}». Antes de decidir, vale la pena revisar sus cursos."),
        dict(id="scaleOverDuels", when="e == 3 && D < 60",
             text="Tu «Me encantaría» a la idea de {escalaTarea} pesó mucho en el resultado. En los duelos, {nombre} sumó {puntos} de {duelos} puntos, con tareas como {tareas}."),
        dict(id="general", when="true",
             text="{nombre} sumó {puntos} de {duelos} puntos en los duelos, con tareas como {tareas}. A la idea de {escalaTarea} le dijiste «{escalaRespuesta}»."),
    ],
    tiebreak=[
        dict(id="tiebreakPicked", when="huboDesempate && ganadoraEnElPar && tareaDesempate != ''",
             text="Con {rival} el resultado estaba muy parejo, y en el desempate te quedaste con {tareaDesempate}."),
        dict(id="tiebreakNoPick", when="huboDesempate && ganadoraEnElPar",
             text="Con {rival} el resultado estaba muy parejo, por eso vale la pena mirar las dos."),
    ],
    second=[
        dict(id="second", when="A2 >= 50",
             text="Tu segunda opción es {segunda}, con {afinidadSegunda} %."),
    ],
    electives=[
        dict(id="electives", when="electivos != ''",
             text="Si te interesa, mira electivos como {electivos}."),
    ],
    tie=[
        dict(id="tie", when="empate",
             text="En los duelos, {a} sumó {puntosA} de {duelosA} puntos y {b}, {puntosB} de {duelosB}. Quedaron empatadas, así que mira los cursos de las dos y quédate con la que más te provoque."),
    ],
    notes=[
        "{tareas} solo sale de los 10 duelos de las 14 preguntas, y queda vacío si la ganadora no sumó nada en ellos. Con A < 50 lo cubre «low»; con A ≥ 50 pasa en un solo caso, el de escala 3 y los dos desempates elegidos a su favor (A = 20 + 30 = 50), y para ese caso está «noMainPoints».",
        "«duelsOverScale» usa «pero» porque su condición exige Nada o Un poco en la escala. «scaleOverDuels» dice que la escala pesó mucho porque con e = 3 y D < 60 la escala aporta 30 puntos y los duelos menos de 42.",
        "Las condiciones usan valores sin redondear. Solo {afinidad} y {afinidadSegunda} se redondean.",
        "Los resúmenes ya vienen en minúscula y en infinitivo, listos para ir después de «como» o de «la idea de».",
    ],
)

def pick(templates, ctx):
    env = dict(ctx)
    for t in templates:
        cond = t["when"].replace("&&", " and ").replace("||", " or ").replace("true", "True")
        cond = cond.replace("!= ''", "!= ''")
        if eval(cond, {}, env): return t
    return None

def render_reason(answers, final, order, tb_done, decided, tie):
    w, s2 = order[0], order[1]
    A = final["A"][w]; D = F(50 * final["h"][w], final["n"][w]); e = final["e"][w]
    scale_q = next(q for q in QUESTIONS if q["type"] == "scale" and q["task"]["specialty"] == w)
    scale_ans = answers[scale_q["n"]]
    won = sorted(final["won"][w], key=lambda x: (x[0], x[1]))[:2]
    tareas = " y ".join(t[2]["summary"] for t in won)
    elect = []
    for t in won:
        name = "«" + ELECTIVE_NAME[t[2]["electives"][0]] + "»"
        if name not in elect: elect.append(name)
    pair = tb_done[0][0]["pair"] if tb_done else []
    rival = next((p for p in pair if p != w), None)
    tarea_tb = ""
    for tb, a in tb_done:
        if a in ("top", "bottom") and tb[a]["specialty"] == w: tarea_tb = tb[a]["summary"]
    vals = {
        "{nombre}": SP[w]["name"], "{afinidad}": str(round(float(A) + 1e-12)),
        "{puntos}": fmt_points(final["h"][w]), "{duelos}": str(final["n"][w]),
        "{tareas}": tareas, "{escalaTarea}": scale_q["task"]["summary"],
        "{escalaRespuesta}": SCALE_LABEL[scale_ans], "{rival}": SP[rival]["name"] if rival else "",
        "{tareaDesempate}": tarea_tb, "{segunda}": SP[s2]["name"],
        "{afinidadSegunda}": str(round(float(final["A"][s2]) + 1e-12)), "{electivos}": " y ".join(elect),
    }
    ctx = dict(A=float(A), D=float(D), e=e, A2=float(final["A"][s2]), huboDesempate=decided,
               ganadoraEnElPar=w in pair, tareaDesempate=tarea_tb, electivos=vals["{electivos}"], empate=tie,
               tareas=tareas)
    parts = []
    if tie:
        t = REASONS["tie"][0]["text"]
        a, b = order[0], order[1]
        vals.update({"{a}": SP[a]["name"], "{b}": SP[b]["name"], "{puntosA}": fmt_points(final["h"][a]),
                     "{duelosA}": str(final["n"][a]), "{puntosB}": fmt_points(final["h"][b]), "{duelosB}": str(final["n"][b])})
        parts.append(t)
        used = ["tie"]
    else:
        used = []
        for key in REASONS["compose"]:
            t = pick(REASONS[key], ctx)
            if t: parts.append(t["text"]); used.append(t["id"])
    out = " ".join(parts)
    for k, v in vals.items(): out = out.replace(k, v)
    assert "{" not in out, out
    return out, used

# ---------------------------------------------------------------- ejemplos
def answers_from(duel, scale):
    a = dict(duel); a.update(scale); return a

EX = []
ex_defs = [
    dict(id="ejemplo-1", title="Ganadora clara, sin desempate",
         duel={1: "top", 2: "both", 3: "bottom", 5: "bottom", 6: "top", 7: "top", 9: "both", 10: "none", 11: "top", 13: "top"},
         scale={4: "un_poco", 8: "un_poco", 12: "bastante", 14: "me_encantaria"}, tb=[]),
    dict(id="ejemplo-2", title="Diferencia de 10 puntos exactos, dos desempates",
         duel={1: "bottom", 2: "bottom", 3: "both", 5: "top", 6: "top", 7: "top", 9: "top", 10: "top", 11: "bottom", 13: "bottom"},
         scale={4: "nada", 8: "bastante", 12: "me_encantaria", 14: "un_poco"}, tb=["bottom", "top"]),
    dict(id="ejemplo-3", title="Un desempate basta",
         duel={1: "top", 2: "top", 3: "none", 5: "bottom", 6: "top", 7: "bottom", 9: "both", 10: "top", 11: "top", 13: "top"},
         scale={4: "me_encantaria", 8: "un_poco", 12: "nada", 14: "bastante"}, tb=["bottom"]),
    dict(id="ejemplo-4", title="Casi todo «Ninguna me llama», con dos desempates",
         duel={1: "none", 2: "none", 3: "none", 5: "none", 6: "none", 7: "bottom", 9: "none", 10: "none", 11: "both", 13: "none"},
         scale={4: "un_poco", 8: "nada", 12: "nada", 14: "un_poco"}, tb=["none", "none"]),
    dict(id="ejemplo-5", title="Duelos mejor que la escala",
         duel={1: "top", 2: "bottom", 3: "top", 5: "top", 6: "top", 7: "none", 9: "none", 10: "none", 11: "top", 13: "top"},
         scale={4: "nada", 8: "un_poco", 12: "bastante", 14: "bastante"}, tb=[]),
    dict(id="ejemplo-6", title="La escala pesa más que los duelos",
         duel={1: "top", 2: "top", 3: "none", 5: "none", 6: "top", 7: "top", 9: "none", 10: "top", 11: "none", 13: "none"},
         scale={4: "me_encantaria", 8: "nada", 12: "un_poco", 14: "un_poco"}, tb=[]),
    dict(id="ejemplo-7", title="Gana sin puntos en los duelos de las 14 preguntas",
         duel={1: "top", 2: "none", 3: "none", 5: "none", 6: "none", 7: "none", 9: "bottom", 10: "none", 11: "none", 13: "none"},
         scale={4: "nada", 8: "nada", 12: "me_encantaria", 14: "un_poco"}, tb=["bottom", "top"]),
    dict(id="ejemplo-8", title="Empate exacto tras dos desempates",
         duel={1: "top", 2: "top", 3: "none", 5: "none", 6: "bottom", 7: "none", 9: "bottom", 10: "top", 11: "top", 13: "none"},
         scale={4: "bastante", 8: "un_poco", 12: "un_poco", 14: "bastante"}, tb=["both", "both"]),
]
for d in ex_defs:
    answers = answers_from(d["duel"], d["scale"])
    final, order, tb_done, decided, tie, trace = run_example(answers, d["tb"])
    reason, used = render_reason(answers, final, order, tb_done, decided, tie)
    EX.append(dict(id=d["id"], title=d["title"],
                   answers={QUESTIONS[n - 1]["id"]: v for n, v in sorted(answers.items())},
                   tiebreakAnswers=[a for (_, a) in tb_done],
                   trace=trace,
                   result=dict(ranking=order, affinity={k: fmt_num(final["A"][k]) for k in ORDER},
                               display={k: round(float(final["A"][k]) + 1e-12) for k in ORDER}, tie=tie),
                   reasonTemplatesUsed=used, reasonText=reason))

# ---------------------------------------------------------------- líneas de Ulises
ULISES = dict(
    welcome=[
        "¡Hola! Soy Ulises. Te voy a mostrar tareas de verdad, de las que se hacen en cada especialidad, y tú eliges cuál harías con más ganas.",
        "Son 14 preguntas, a veces una o dos más para desempatar, y te toma unos tres minutos. No hay respuestas buenas ni malas.",
        "Piensa en lo que harías con gusto un día cualquiera, no en lo que suena más importante.",
        "Si te gustan las dos, dilo. Si ninguna te llama, también vale.",
    ],
    startButton="Vamos",
    duelHelp="Toca la tarea que harías con más ganas.",
    scaleHelp="Elige cuánto te gustaría hacer esta tarea.",
    reactions=dict(
        pick=["Anotado.", "¡Cra!", "Listo.", "Ya, siguiente.", "Lo apunto.", "Sigamos.", "Tomo nota."],
        both=["Las dos, ¿no? Eso también cuenta.", "Ya, medio punto para cada una."],
        none=["Ninguna, ya. También me sirve saberlo.", "Ok, ninguna de las dos era lo tuyo."],
        scale=["Anotado.", "Lo tengo.", "¡Cra!"],
        usage="Si la pregunta trae su propia reacción, esa va primero. Estas son para variar o para cuando no hay línea propia. Ninguna felicita una elección ni nombra especialidades durante el test, y el anuncio del desempate tampoco las nombra, para no delatar de quién es cada tarea.",
    ),
    result=dict(
        loading="Dame un toque que junto tus respuestas.",
        intro="Ya tengo tu resultado.",
        winner="Lo tuyo apunta a {nombre}, con {afinidad} % de afinidad.",
        second="En segundo lugar quedó {segunda}, con {afinidadSegunda} %.",
        tie="Empate. {a} y {b} quedaron igualitas, con {afinidad} %.",
        low="Esta vez ninguna despegó del todo. Por ahora, {nombre} va adelante, con {afinidad} %.",
        closing="Tómalo como una brújula, no como una sentencia. La mayoría de electivos se abren al terminar el quinto ciclo, así que tienes tiempo para explorar.",
        retake="Si más adelante cambias de idea, puedes volver a hacer el test.",
        retakeNote="Usar solo si la app deja repetir el test.",
    ),
    tiebreak=dict(
        first="Tienes dos especialidades muy parejas. Te hago una pregunta más para desempatar.",
        second="Sigue reñido. Una última y listo.",
        resolved="Ahí está, ya se inclinó la balanza.",
        stillTied="Ni así se separan. Te muestro las dos.",
        usage="La línea first va antes del desempate 1 y second antes del desempate 2. Al terminar los desempates, stillTied va solo si hay empate exacto (las dos primeras con la misma afinidad sin redondear); en cualquier otro caso va resolved.",
    ),
)

WEIGHTS = dict(
    duel=dict(pick=1, both=0.5, none=0, duelsPerSpecialty=5,
              rule="En cada duelo, la tarea elegida da 1 punto a su especialidad. «Me gustan las dos» da 0,5 a cada una. «Ninguna me llama» no suma a ninguna, pero el duelo cuenta como mostrado."),
    scale=dict(options=SCALE_OPTIONS, max=3,
               rule="Cada especialidad tiene una sola escala. Nada = 0, Un poco = 1, Bastante = 2, Me encantaría = 3."),
    affinity=dict(
        duelsWeight=0.7, scaleWeight=0.3,
        formula="A = 0,7 · D + 0,3 · E",
        D="D = 100 · puntos / duelos, donde duelos son los duelos mostrados de esa especialidad (5, o 6 o 7 con desempates).",
        E="E = 100 · valor / 3",
        closedForm="A = 35 · h / n + 10 · e, con h = medios puntos (2 por elección, 1 por «las dos»), n = duelos mostrados y e = valor de la escala. Con n = 5 queda A = 7 · h + 10 · e, siempre entero.",
        range=[0, 100]),
    tiebreak=dict(
        threshold=10, maxDuels=2,
        trigger="Tras la pregunta 14 se ordenan las cuatro por afinidad. Si A(1.ª) − A(2.ª) ≤ 10, se muestra el desempate 1 del par formado por esas dos.",
        scoring="Un duelo de desempate cuenta como cualquier duelo. Suma a los puntos y a los duelos mostrados de las dos especialidades del par, y no toca a las otras dos. Se recalcula A con la misma fórmula.",
        second="Si después del desempate 1 la diferencia entre las dos del par sigue en 10 o menos, se muestra el desempate 2 del mismo par. No hay tercero.",
        bankOrder="El par se nombra en el orden sw, ti, si, vj. El desempate 1 es el de order = 1 y el 2 el de order = 2; entre los dos alternan arriba y abajo.",
        finalTie="Si al final las dos primeras tienen exactamente la misma afinidad, el resultado es empate y se muestran las dos.",
        edgeCase="Si en el desempate eligen «Ninguna me llama», las dos del par bajan y una tercera podría pasarlas. El resultado se ordena igual por afinidad y no se abren más desempates."),
    ranking=dict(
        sortKey=["A descendente", "D descendente", "valor de escala descendente", "orden fijo sw, ti, si, vj"],
        sortKeyNote="Los criterios 2 a 4 solo ordenan especialidades con la misma A, por ejemplo para elegir cuál entra al desempate o cuál se muestra segunda. El criterio 3 nunca llega a decidir, porque con la misma A y la misma D la escala también es igual. El orden fijo nunca decide al ganador, porque la igualdad exacta al final es empate.",
        display="La afinidad se muestra redondeada a entero, con .5 hacia arriba. Todas las comparaciones usan el valor sin redondear.",
        precision="Con un desempate, A puede dejar de ser entera (35 · h / 6); con dos vuelve a serlo (35 · h / 7 = 5 · h). Conviene comparar con fracciones o con una tolerancia de 1e-9."),
    examples=EX,
)

META = dict(
    title="Test de especialidad",
    language="es-PE",
    audience="Alumnos de primeros ciclos de Ingeniería de Sistemas (plan 2026-1).",
    host="Ulises, el cuervo del chatbot.",
    flow=["bienvenida", "preguntas 1 a 14", "desempate 1 (si la diferencia es de 10 o menos)", "desempate 2 (si sigue en 10 o menos)", "resultado con motivo"],
    duelOptions=[dict(id="top", label="(tarea de arriba)"), dict(id="bottom", label="(tarea de abajo)"),
                 dict(id="both", label="Me gustan las dos"), dict(id="none", label="Ninguna me llama")],
    sources=[
        dict(file="Sumillas_2025-1.pdf", title="Sumillas de Ingeniería de Sistemas", used="Sumilla de cada electivo de Ingeniería de Sistemas; no trae los cursos de Comunicación."),
        dict(file="sílabos 2026-2 de cactus", title="Sílabos de Storytelling, Narrativa Gráfica, Diseño de Videojuegos, Proyecto de Videojuegos, Programación Móvil, Proyecto de Desarrollo de Software e Interacción Humano Computadora", used="Contenido semana a semana para cotejar las tareas de Desarrollo de Videojuegos."),
        dict(file="diplomas_de_especialidad_2025-1_v3.pdf", title="Plan de estudios de los diplomas de especialidad", pages=4,
             used="Nombres de los cuatro diplomas, los 7 electivos de cada uno con código, créditos y requisito, y los requisitos del diploma."),
        dict(file="2_plan_de_estudios_formato_web_v4.1_100725_1 (2).pdf", title="Plan de estudios (lista de asignaturas electivas)",
             used="Su lista de asignaturas electivas trae 22 cursos. Los 21 electivos de Ingeniería de Sistemas que usan los diplomas coinciden en código, nombre, créditos y requisito; Seguridad, Salud Ocupacional y Bienestar Organizacional (520074) no está en ningún diploma, y los tres cursos de Comunicaciones del diploma de Videojuegos no salen en esa lista."),
    ],
    sourceLimits="Las tareas de los 21 electivos de Ingeniería de Sistemas se cotejaron con «Sumillas 2025-1» y las de Desarrollo de Videojuegos con sus sílabos 2026-2 de cactus. La sumilla de Arquitectura de Tecnologías de la Información (650083) es idéntica a la de Arquitectura Empresarial en ese PDF, así que su tarea no se pudo cotejar.",
    diplomaRules=[
        "Tener el grado de bachiller.",
        "Haber aprobado todas las asignaturas del diploma, como máximo por segunda vez.",
        "Tener un promedio ponderado de 14,00 o más en las notas aprobatorias de las asignaturas del diploma.",
    ],
    diplomaNotes=[
        "Desarrollo de Videojuegos suma 23 créditos porque Diseño de Videojuegos vale 5; los otros tres diplomas suman 21.",
        "Storytelling, Diseño de Videojuegos y Narrativa Gráfica son de la carrera de Comunicaciones.",
        "El PDF de diplomas lista Diseño de Videojuegos como 550043, pero sus sílabos de 2025-1 a 2026-2 traen el código 550090 y en cactus el 550043 es Taller de Prototipado de Videojuegos. El dueño decidió usar 550090 el 2026-09-25. El requisito del diploma es Storytelling y el del sílabo es Gamificación; el test conserva el del diploma.",
        "Programación Móvil, Proyecto de Desarrollo de Software e Interacción Humano Computadora están en Software y en Videojuegos. Arquitectura de Tecnologías de la Información está en TI y en Sistemas de Información. Por eso ningún duelo usa un electivo compartido contra la especialidad con la que lo comparte.",
    ],
    illustrationGuidelines="Ilustración plana, sin texto legible, sin logos ni marcas reales y sin personas reconocibles. El color de acento es el de la especialidad solo después de revelar el resultado; durante el test las dos tarjetas usan el mismo estilo neutro para no delatar a qué especialidad pertenecen.",
    writingRules=[
        "Tareas de 6 a 14 palabras, en infinitivo, con un escenario que se pueda imaginar.",
        "Sin jerga difícil, sin dos puntos ni guiones largos.",
        "Trato de tú y lenguaje neutro en género.",
        "Ulises no nombra especialidades ni felicita elecciones durante el test.",
    ],
)

BALANCE = dict(
    appearances=app, topCount=top,
    bottomCount={k: 5 - top[k] for k in ORDER},
    pairCounts={f"{a}-{b}": len(pairs[(a, b)]) for a, b in itertools.combinations(ORDER, 2)},
    pairsOnce=[f"{a}-{b}" for (a, b), v in pairs.items() if len(v) == 1],
    scalePositions={q["task"]["specialty"]: q["n"] for q in scales},
    electivesUsed={k: sorted({c for _, t in all_tasks() if t["specialty"] == k for c in t["electives"]}) for k in ORDER},
    wordCount=dict(min=min(t["wordCount"] for _, t in all_tasks()), max=max(t["wordCount"] for _, t in all_tasks())),
    sideSequence=sides,
    adjacentShared=adjacent_shared,
    rationale="Con 10 duelos y 5 apariciones por especialidad, cuatro pares salen dos veces y dos salen una, y esos dos no pueden compartir especialidad. Salen una vez sw-ti y si-vj, para que salgan dos veces los pares que más se confunden, que son sw-vj (comparten tres electivos), ti-si (comparten Arquitectura de TI) y sw-si (a un alumno nuevo le suenan parecido). ti-vj sale dos veces porque la cuenta lo exige.",
    sequenceRule=f"Ninguna especialidad sale en tres ítems seguidos, ninguna escala queda junto a un duelo de su misma especialidad y ninguna especialidad sale más de dos veces seguidas en el mismo lado. Dos ítems vecinos comparten especialidad solo {adjacent_shared} veces.",
)

def clean(q):
    q = dict(q)
    keys = ["n", "id", "type", "block", "prompt"]
    if q["type"] == "duel": keys += ["pair", "top", "bottom", "reaction"]
    else: keys += ["specialty", "task", "blockClose"]; q["specialty"] = q["task"]["specialty"]
    return {k: q[k] for k in keys}

DOC = dict(
    version=VERSION,
    meta=META,
    specialties=SPECIALTIES,
    questions=[clean(q) for q in QUESTIONS],
    tiebreakers=[{k: tb[k] for k in ["id", "pair", "order", "prompt", "top", "bottom"]} for tb in TIEBREAKERS],
    weights=WEIGHTS,
    reasonTemplates=REASONS,
    ulisesLines=ULISES,
    balance=BALANCE,
)
TEXTO_JSON = json.dumps(DOC, ensure_ascii=False, indent=2) + "\n"
if DESTINO_JSON.exists() and DESTINO_JSON.read_text(encoding="utf-8") != TEXTO_JSON:
    raise SystemExit(f"{DESTINO_JSON.name} ya está publicada y cambiaría. Una versión publicada no cambia: "
                     "sube VERSION y registra la nueva en content/index.ts.")
DESTINO_JSON.parent.mkdir(parents=True, exist_ok=True)
DESTINO_JSON.write_text(TEXTO_JSON, encoding="utf-8")

# ---------------------------------------------------------------- markdown
def esc(s): return str(s).replace("|", "\\|")
L = []
P = L.append
P(f"# Test de especialidad de ULima++, contenido v{DOC['version']}\n")
P(f"Contenido del test que conduce Ulises. El archivo `src/modules/specialty-test/content/{VERSION}.json` tiene lo mismo en forma de datos; este documento sirve para revisarlo.\n")
P("## Fuentes\n")
for s in META["sources"]:
    P(f"- `{s['file']}`. {s['used']}")
P(f"\n{META['sourceLimits']}\n")
P("## Especialidades\n")
P("| Clave | Nombre | Color claro | Color oscuro | Ícono Lucide | Qué hace quien la estudia |")
P("|---|---|---|---|---|---|")
for s in SPECIALTIES:
    P(f"| {s['key']} | {s['name']} | `{s['color']['light']}` | `{s['color']['dark']}` | `{s['icon']['lucide']}` | {esc(s['tagline'])} |")
P("\nLos colores claros tienen un contraste de 5,1:1 o más sobre blanco y sobre `#F8FAFC`, y los oscuros de 6,3:1 o más sobre `#1E1E24` y `#16161C`. Se separan entre sí también con protanopia, deuteranopia y tritanopia (distancia mínima en Lab de 24 en claro y 18 en oscuro) y se alejan del naranja de la marca.\n")
for s in SPECIALTIES:
    P(f"### {s['name']} ({s['key']}), {s['totalCredits']} créditos\n")
    P("| Código | Electivo | Créditos | Requisito | También en |")
    P("|---|---|---|---|---|")
    for e in s["electives"]:
        P(f"| {e['code']} | {esc(e['name'])} | {e['credits']} | {esc(e['prerequisite'])} | {', '.join(e['sharedWith']) or ''} |")
    P("")
P("Requisitos para obtener cualquiera de los diplomas, según el PDF.\n")
for r in META["diplomaRules"]: P(f"- {r}")
P("")
for r in META["diplomaNotes"]: P(f"- {r}")
P("\n## Preguntas\n")
P(f"Los duelos preguntan «{DUEL_PROMPT}» y ofrecen la tarea de arriba, la de abajo, «Me gustan las dos» y «Ninguna me llama». Las escalas preguntan «{SCALE_PROMPT}» con Nada, Un poco, Bastante y Me encantaría.\n")
P("| # | Tipo | Arriba | Abajo | Ulises |")
P("|---|---|---|---|---|")
for q in QUESTIONS:
    if q["type"] == "duel":
        t, b = q["top"], q["bottom"]
        P(f"| {q['n']} | Duelo {t['specialty']}-{b['specialty']} | **{t['specialty']}** {esc(t['text'])} ({t['wordCount']}) | **{b['specialty']}** {esc(b['text'])} ({b['wordCount']}) | {esc(q['reaction'])} |")
    else:
        t = q["task"]
        P(f"| {q['n']} | Escala {t['specialty']} | **{t['specialty']}** {esc(t['text'])} ({t['wordCount']}) | | {esc(q['blockClose'])} |")
P("\nEl número entre paréntesis es la cantidad de palabras.\n")
P("### Resumen, electivo, ícono e ilustración de cada tarea\n")
P("| # | Esp. | Resumen para los motivos | Electivo | Ícono | Idea de ilustración |")
P("|---|---|---|---|---|---|")
for q in QUESTIONS:
    items = [q["top"], q["bottom"]] if q["type"] == "duel" else [q["task"]]
    for t in items:
        el = ", ".join(f"{c} {ELECTIVE_NAME[c]}" for c in t["electives"])
        P(f"| {q['n']} | {t['specialty']} | {esc(t['summary'])} | {esc(el)} | `{t['icon']['lucide']}` | {esc(t['illustration'])} |")
P("\nCada tarea lleva un ícono de Lucide (lucide_icons_flutter 3.1.15) que representa la tarea y no la especialidad. "
  "El generador comprueba que cada nombre existe en `lucide-nombres.txt` con su constante de `LucideIcons`, que ninguna tarea usa el ícono de una especialidad "
  "y que ningún glifo se repite en el test, ni siquiera entre las dos tareas de un duelo o de un desempate.\n")
P("### Balance\n")
P("| | sw | ti | si | vj |")
P("|---|---|---|---|---|")
P("| Duelos | " + " | ".join(str(app[k]) for k in ORDER) + " |")
P("| Arriba | " + " | ".join(str(top[k]) for k in ORDER) + " |")
P("| Abajo | " + " | ".join(str(5 - top[k]) for k in ORDER) + " |")
P("| Escala en la pregunta | " + " | ".join(str(BALANCE["scalePositions"][k]) for k in ORDER) + " |")
P("\n| Par | Veces | Preguntas |")
P("|---|---|---|")
for a, b in itertools.combinations(ORDER, 2):
    qs = pairs[(a, b)]
    P(f"| {a}-{b} | {len(qs)} | " + ", ".join(f"{q['n']} ({q['top']['specialty']} arriba)" for q in qs) + " |")
P("\n| | " + " | ".join(ORDER) + " |")
P("|---|" + "---|" * len(ORDER))
P("| Lados en orden (A arriba, B abajo) | " + " | ".join(BALANCE["sideSequence"][k] for k in ORDER) + " |")
P(f"\n{BALANCE['rationale']} {BALANCE['sequenceRule']} Las tareas miden entre {BALANCE['wordCount']['min']} y {BALANCE['wordCount']['max']} palabras.\n")
P("## Desempates\n")
P("| Id | Par | Arriba | Abajo | Electivos | Íconos |")
P("|---|---|---|---|---|---|")
for tb in TIEBREAKERS:
    t, b = tb["top"], tb["bottom"]
    P(f"| {tb['id']} | {tb['pair'][0]}-{tb['pair'][1]} | **{t['specialty']}** {esc(t['text'])} ({t['wordCount']}) | **{b['specialty']}** {esc(b['text'])} ({b['wordCount']}) | {t['electives'][0]}, {b['electives'][0]} | `{t['icon']['lucide']}`, `{b['icon']['lucide']}` |")
P("\n## Puntaje\n")
W = WEIGHTS
for k in ["duel", "scale"]: P(f"- {W[k]['rule']}")
P(f"- Afinidad. {W['affinity']['formula']}. {W['affinity']['D']} {W['affinity']['E']}.")
P(f"- Forma exacta. {W['affinity']['closedForm']}")
for k in ["trigger", "scoring", "second", "bankOrder", "finalTie", "edgeCase"]: P(f"- {W['tiebreak'][k]}")
P(f"- Orden. " + ", luego ".join(W["ranking"]["sortKey"]) + f". {W['ranking']['sortKeyNote']}")
P(f"- {W['ranking']['display']} {W['ranking']['precision']}")
P("\n### Ejemplos\n")
for ex in EX:
    P(f"#### {ex['title']} ({ex['id']})\n")
    ans = ", ".join(f"{k[1:].lstrip('0')}={v}" for k, v in ex["answers"].items())
    P(f"Respuestas {ans}." + (f" Desempates {', '.join(ex['tiebreakAnswers'])}." if ex["tiebreakAnswers"] else "") + "\n")
    P("| Etapa | Puntos de duelo | Escala | Afinidad |")
    P("|---|---|---|---|")
    for tr in ex["trace"]:
        ks = list(tr["affinity"].keys())
        P(f"| {esc(tr['stage'])} | " + ", ".join(f"{k} {tr['duelPoints'][k]}" for k in ks) + " | " +
          (", ".join(f"{k} {tr['scale'][k]}" for k in ks) if "scale" in tr else "") + " | " +
          ", ".join(f"{k} {tr['affinity'][k]}" for k in ks) + (f" (diferencia {tr['gap']})" if "gap" in tr else "") + " |")
    r = ex["result"]
    res = ", ".join("%s %s %%" % (k, r["display"][k]) for k in r["ranking"])
    P("\nResultado " + res + (" (empate)" if r["tie"] else "") + ". Plantillas " + ", ".join(ex["reasonTemplatesUsed"]) + ".\n")
    P(f"> {ex['reasonText']}\n")
P("## Motivos sin IA\n")
P(REASONS["composeRule"] + "\n")
P("| Grupo | Id | Condición | Texto |")
P("|---|---|---|---|")
for g in ["main", "tiebreak", "second", "electives", "tie"]:
    for t in REASONS[g]:
        P(f"| {g} | {t['id']} | `{esc(t['when'])}` | {esc(t['text'])} |")
P("\n| Variable | Significado |")
P("|---|---|")
for k, v in REASONS["variables"].items(): P(f"| `{esc(k)}` | {esc(v)} |")
for k, v in REASONS["derived"].items(): P(f"| `{k}` | {esc(v)} |")
P("")
for n in REASONS["notes"]: P(f"- {n}")
P("\n## Líneas de Ulises\n")
P("| Momento | Texto |")
P("|---|---|")
for i, t in enumerate(ULISES["welcome"], 1): P(f"| Bienvenida {i} | {esc(t)} |")
P(f"| Botón | {ULISES['startButton']} |")
P(f"| Ayuda en duelos | {ULISES['duelHelp']} |")
P(f"| Ayuda en escalas | {ULISES['scaleHelp']} |")
for k in ["pick", "both", "none", "scale"]:
    P(f"| Reacción ({k}) | {esc(' / '.join(ULISES['reactions'][k]))} |")
for k, v in ULISES["result"].items(): P(f"| Resultado ({k}) | {esc(v)} |")
for k, v in ULISES["tiebreak"].items():
    if k != "usage": P(f"| Desempate ({k}) | {esc(v)} |")
P(f"\n{ULISES['reactions']['usage']} {ULISES['tiebreak']['usage']}\n")
P("## Pautas\n")
for r in META["writingRules"]: P(f"- {r}")
P(f"- {META['illustrationGuidelines']}")
DESTINO_MD.parent.mkdir(parents=True, exist_ok=True)
DESTINO_MD.write_text("\n".join(L) + "\n", encoding="utf-8")
print("ok")
for ex in EX:
    print(ex["id"], ex["result"]["ranking"], ex["result"]["display"], ex["reasonTemplatesUsed"])
    for tr in ex["trace"]: print("   ", tr)
    print("   ", ex["reasonText"])
