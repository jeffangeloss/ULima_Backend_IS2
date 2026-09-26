# Test de especialidad de ULima++, contenido v2026-09-25.4

Contenido del test que conduce Ulises. El archivo `src/modules/specialty-test/content/2026-09-25.4.json` tiene lo mismo en forma de datos; este documento sirve para revisarlo.

## Fuentes

- `Sumillas_2025-1.pdf`. Sumilla de cada electivo de Ingeniería de Sistemas; no trae los cursos de Comunicación.
- `sílabos 2026-2 de cactus`. Contenido semana a semana para cotejar las tareas de Desarrollo de Videojuegos.
- `diplomas_de_especialidad_2025-1_v3.pdf`. Nombres de los cuatro diplomas, los 7 electivos de cada uno con código, créditos y requisito, y los requisitos del diploma.
- `2_plan_de_estudios_formato_web_v4.1_100725_1 (2).pdf`. Su lista de asignaturas electivas trae 22 cursos. Los 21 electivos de Ingeniería de Sistemas que usan los diplomas coinciden en código, nombre, créditos y requisito; Seguridad, Salud Ocupacional y Bienestar Organizacional (520074) no está en ningún diploma, y los tres cursos de Comunicaciones del diploma de Videojuegos no salen en esa lista.

Las tareas de los 21 electivos de Ingeniería de Sistemas se cotejaron con «Sumillas 2025-1» y las de Desarrollo de Videojuegos con sus sílabos 2026-2 de cactus. La sumilla de Arquitectura de Tecnologías de la Información (650083) es idéntica a la de Arquitectura Empresarial en ese PDF, así que su tarea no se pudo cotejar.

## Especialidades

| Clave | Nombre | Color claro | Color oscuro | Ícono Lucide | Qué hace quien la estudia |
|---|---|---|---|---|---|
| sw | Ingeniería de Software | `#1E3A8A` | `#A5C0F7` | `code-xml` | Diseña y programa aplicaciones que funcionan bien y se pueden seguir mejorando. |
| ti | Tecnologías de la Información | `#0F7A45` | `#7EE8BE` | `server-cog` | Mantiene funcionando y protegidas las redes, los servidores y la nube de una organización. |
| si | Sistemas de Información | `#9333EA` | `#B98AF8` | `chart-column-big` | Usa los datos de una organización para decidir mejor y cambiar la forma en que trabaja. |
| vj | Desarrollo de Videojuegos | `#76164A` | `#EC7FB3` | `gamepad-2` | Crea videojuegos, desde la historia y las reglas hasta la programación y las pruebas con jugadores. |

Los colores claros tienen un contraste de 5,1:1 o más sobre blanco y sobre `#F8FAFC`, y los oscuros de 6,3:1 o más sobre `#1E1E24` y `#16161C`. Se separan entre sí también con protanopia, deuteranopia y tritanopia (distancia mínima en Lab de 24 en claro y 18 en oscuro) y se alejan del naranja de la marca.

### Ingeniería de Software (sw), 21 créditos

| Código | Electivo | Créditos | Requisito | También en |
|---|---|---|---|---|
| 650070 | Paradigmas de Programación | 3 | Haber culminado el V ciclo |  |
| 650072 | Análisis y Diseño de Algoritmos | 3 | Haber culminado el V ciclo y aprobado Estructuras de Datos II |  |
| 650075 | Deep Learning | 3 | Haber culminado el V ciclo y aprobado Aprendizaje de Máquina / Machine Learning |  |
| 650030 | Programación Móvil | 3 | Haber culminado el V ciclo y aprobado Programación Web | vj |
| 650079 | Proyecto de Desarrollo de Software | 3 | Haber culminado el V ciclo y aprobado Ingeniería de Software II | vj |
| 650085 | Arquitectura de Software | 3 | Haber culminado el V ciclo |  |
| 650011 | Interacción Humano Computadora / Human Computer Interaction | 3 | Haber culminado el V ciclo | vj |

### Tecnologías de la Información (ti), 21 créditos

| Código | Electivo | Créditos | Requisito | También en |
|---|---|---|---|---|
| 650012 | Internet de las Cosas / Internet of Things | 3 | Haber culminado el V ciclo |  |
| 650073 | Redes Avanzadas | 3 | Haber culminado el V ciclo y aprobado Redes de Computadoras |  |
| 650077 | Sistemas Distribuidos | 3 | Haber culminado el V ciclo |  |
| 650076 | Tópicos Avanzados en Ciberseguridad | 3 | Haber culminado el V ciclo y aprobado Ciberseguridad / Cybersecurity |  |
| 650025 | Computación en la Nube | 3 | Haber culminado el V ciclo |  |
| 650083 | Arquitectura de Tecnologías de la Información | 3 | Haber culminado el V ciclo | si |
| 650084 | DevOps | 3 | Haber culminado el V ciclo |  |

### Sistemas de Información (si), 21 créditos

| Código | Electivo | Créditos | Requisito | También en |
|---|---|---|---|---|
| 650071 | Gestión de Base de Datos | 3 | Haber culminado el V ciclo |  |
| 650074 | Ingeniería del Conocimiento | 3 | Haber culminado el V ciclo |  |
| 650044 | Analítica con Big Data | 3 | Haber culminado el V ciclo y aprobado Sistemas de Inteligencia Empresarial |  |
| 650078 | Analítica de Negocios | 3 | Haber culminado el V ciclo |  |
| 650080 | Innovación Digital | 3 | Haber culminado el V ciclo |  |
| 650083 | Arquitectura de Tecnologías de la Información | 3 | Haber culminado el V ciclo | ti |
| 650082 | Arquitectura Empresarial | 3 | Haber culminado el V ciclo y aprobado Planeamiento Estratégico |  |

### Desarrollo de Videojuegos (vj), 23 créditos

| Código | Electivo | Créditos | Requisito | También en |
|---|---|---|---|---|
| 550001 | Storytelling | 3 | Sin requisito |  |
| 550090 | Diseño de Videojuegos | 5 | Aprobado Storytelling |  |
| 550029 | Narrativa Gráfica | 3 | Aprobado Storytelling |  |
| 650030 | Programación Móvil | 3 | Haber culminado el V ciclo y aprobado Programación Web | sw |
| 650079 | Proyecto de Desarrollo de Software | 3 | Haber culminado el V ciclo y aprobado Ingeniería de Software II | sw |
| 650081 | Proyecto de Videojuegos | 3 | Haber culminado el V ciclo |  |
| 650011 | Interacción Humano Computadora / Human Computer Interaction | 3 | Haber culminado el V ciclo | sw |

Requisitos para obtener cualquiera de los diplomas, según el PDF.

- Tener el grado de bachiller.
- Haber aprobado todas las asignaturas del diploma, como máximo por segunda vez.
- Tener un promedio ponderado de 14,00 o más en las notas aprobatorias de las asignaturas del diploma.

- Desarrollo de Videojuegos suma 23 créditos porque Diseño de Videojuegos vale 5; los otros tres diplomas suman 21.
- Storytelling, Diseño de Videojuegos y Narrativa Gráfica son de la carrera de Comunicaciones.
- El PDF de diplomas lista Diseño de Videojuegos como 550043, pero sus sílabos de 2025-1 a 2026-2 traen el código 550090 y en cactus el 550043 es Taller de Prototipado de Videojuegos. El dueño decidió usar 550090 el 2026-09-25. El requisito del diploma es Storytelling y el del sílabo es Gamificación; el test conserva el del diploma.
- Programación Móvil, Proyecto de Desarrollo de Software e Interacción Humano Computadora están en Software y en Videojuegos. Arquitectura de Tecnologías de la Información está en TI y en Sistemas de Información. Por eso ningún duelo usa un electivo compartido contra la especialidad con la que lo comparte.

## Preguntas

Los duelos preguntan «¿Cuál harías con más ganas?» y ofrecen la tarea de arriba, la de abajo, «Me gustan las dos» y «Ninguna me llama». Las escalas preguntan «¿Cuánto te gustaría hacer esto?» con Nada, Un poco, Bastante y Me encantaría.

| # | Tipo | Arriba | Abajo | Ulises |
|---|---|---|---|---|
| 1 | Duelo sw-si | **sw** Programar la app con la que una bodega recibe pedidos del barrio (12) | **si** Revisar las ventas de una bodega para decidir qué productos conviene reponer (12) | Arrancamos por el barrio. Sigue eligiendo lo que harías con ganas, no lo que suena más serio. |
| 2 | Duelo ti-vj | **ti** Conectar sensores que avisen al celular si la refrigeradora de una botica se calienta (14) | **vj** Diseñar los niveles de un juego para que se pongan difíciles poco a poco (14) | Anotado. Yo me quedo mirando cualquier cosa que brille, cosas de cuervo. |
| 3 | Duelo vj-si | **vj** Observar a jugadores probando un juego y anotar dónde se traban o aburren (13) | **si** Planear cómo un mercado de abastos vende por internet sin perder a sus caseros (14) | Ya. Aquí no hay respuestas buenas ni malas, solo las tuyas. |
| 4 | Escala ti | **ti** Pasar a la nube los sistemas de diez pollerías sin cortar la atención (13) | | Primer tramo listo. Van 4 de 14. |
| 5 | Duelo vj-sw | **vj** Programar cómo salta y choca un personaje en un juego de plataformas (12) | **sw** Entrenar un programa que reconozca en fotos si una palta está madura (12) | Esa estaba reñida. Sigamos. |
| 6 | Duelo si-ti | **si** Organizar los datos de una clínica para encontrar cualquier historia clínica en segundos (13) | **ti** Diseñar el wifi de un colegio para que todas las aulas tengan buena señal (14) | ¡Cra! Ya voy entendiendo por dónde vuelas. |
| 7 | Duelo sw-ti | **sw** Hacer el plano de una app grande antes de que el equipo la programe (14) | **ti** Automatizar que cada versión nueva de una app se pruebe y se publique sola (14) | Lo apunto en mi libreta. |
| 8 | Escala vj | **vj** Programar un juego sencillo para celular que se juegue con una mano (12) | | Ya pasaste la mitad. Recuerda que mido tus ganas, no tus notas. |
| 9 | Duelo si-sw | **si** Convertir lo que sabe un asesor de créditos en reglas para evaluar préstamos (13) | **sw** Probar con usuarios si la app de un banco se entiende a la primera (14) | Tranqui, nada de esto te amarra a una especialidad. |
| 10 | Duelo ti-si | **ti** Evitar que la web de entradas de un concierto se caiga cuando todos compran (14) | **si** Analizar millones de viajes del Metropolitano para saber a qué hora se llena (13) | Vas volando. Quedan pocas. |
| 11 | Duelo sw-vj | **sw** Programar el cálculo de la ruta más corta para un repartidor de delivery (13) | **vj** Escribir la historia y los diálogos de los personajes de un juego (12) | Una más al bolsillo. |
| 12 | Escala si | **si** Descubrir con datos qué clientes de una tienda están por dejar de comprar (13) | | Te quedan dos. Ya casi te cuento lo que vi. |
| 13 | Duelo vj-ti | **vj** Dibujar en viñetas cómo avanza la historia de un juego antes de programarlo (13) | **ti** Averiguar por dónde se coló un atacante en el sistema de una municipalidad (13) | Ahora sí viene la recta final. |
| 14 | Escala sw | **sw** Programar una app que avise cuándo pasa el bus por tu paradero (12) | | ¡Listo, terminaste las 14! |

El número entre paréntesis es la cantidad de palabras.

### Resumen, electivo, ícono e ilustración de cada tarea

| # | Esp. | Resumen para los motivos | Electivo | Ícono | Idea de ilustración |
|---|---|---|---|---|---|
| 1 | sw | programar la app de pedidos de una bodega | 650030 Programación Móvil | `shopping-cart` | Celular con la app de una bodega abierta, un carrito con arroz y gaseosa, y la bodega de esquina al fondo. |
| 1 | si | decidir con las ventas qué reponer en una bodega | 650078 Analítica de Negocios | `shelving-unit` | Estante de bodega con un gráfico de barras encima y una flecha que marca el producto que más sale. |
| 2 | ti | vigilar con sensores la refrigeradora de una botica | 650012 Internet de las Cosas | `refrigerator` | Refrigeradora de botica con un sensor pequeño pegado a la puerta y un celular que muestra una alerta de temperatura. |
| 2 | vj | diseñar niveles que se ponen difíciles poco a poco | 650081 Proyecto de Videojuegos, 550090 Diseño de Videojuegos | `mountain` | Cinco niveles de un juego dibujados como escalones, con obstáculos que crecen en cada uno. |
| 3 | vj | observar a jugadores probando un juego | 550090 Diseño de Videojuegos, 650011 Interacción Humano Computadora | `eye` | Dos jóvenes jugando con un mando mientras una persona detrás toma notas. |
| 3 | si | planear la venta por internet de un mercado | 650080 Innovación Digital | `store` | Puesto de mercado con su casera atendiendo y, al lado, un celular con la tienda del mercado. |
| 4 | ti | pasar a la nube los sistemas de diez pollerías | 650025 Computación en la Nube | `drumstick` | Local de pollería atendiendo normal mientras sus datos suben a una nube dibujada sobre el techo. |
| 5 | vj | programar cómo salta un personaje de juego | 650081 Proyecto de Videojuegos | `rabbit` | Personaje de juego en pleno salto entre dos plataformas, con la curva del salto marcada. |
| 5 | sw | entrenar un programa que reconoce paltas maduras | 650075 Deep Learning | `camera` | Celular que fotografía tres paltas y marca con un check la que está lista. |
| 6 | si | ordenar los datos de una clínica | 650071 Gestión de Base de Datos | `folder-search` | Recepción de clínica con una pantalla que encuentra una ficha entre miles de carpetas ordenadas. |
| 6 | ti | diseñar el wifi de un colegio | 650073 Redes Avanzadas | `school` | Plano de un colegio con antenas de wifi y ondas que cubren todas las aulas. |
| 7 | sw | hacer el plano de una app grande | 650085 Arquitectura de Software | `drafting-compass` | Plano azul de arquitecto con las piezas de una app unidas por flechas. |
| 7 | ti | automatizar las pruebas y la publicación de una app | 650084 DevOps | `rocket` | Cinta transportadora por la que pasan versiones de una app, cada una con un check de prueba antes de salir. |
| 8 | vj | programar un juego sencillo para celular | 650081 Proyecto de Videojuegos, 650030 Programación Móvil | `smartphone` | Mano que sostiene un celular y juega con el pulgar un juego de colores simples. |
| 9 | si | convertir lo que sabe un asesor de créditos en reglas | 650074 Ingeniería del Conocimiento | `hand-coins` | Asesor de créditos que conversa mientras sus ideas pasan a una lista de reglas con flechas de sí y no. |
| 9 | sw | probar con usuarios si una app se entiende | 650011 Interacción Humano Computadora | `clipboard-pen-line` | Persona que usa la app de un banco mientras alguien a su lado anota en un portapapeles. |
| 10 | ti | evitar que la web de un concierto se caiga | 650077 Sistemas Distribuidos | `ticket` | Fila enorme de personas frente a una web de entradas, sostenida por varios servidores que se reparten la carga. |
| 10 | si | analizar millones de viajes en bus | 650044 Analítica con Big Data | `clock-arrow-up` | Bus articulado sin logos junto a un gráfico de horas con un pico marcado en la hora punta. |
| 11 | sw | calcular la ruta más corta de un repartidor | 650072 Análisis y Diseño de Algoritmos | `route` | Mapa de un distrito con cinco puntos de entrega unidos por una sola línea y una moto de delivery. |
| 11 | vj | escribir la historia y los diálogos de un juego | 550001 Storytelling | `messages-square` | Cuaderno abierto con globos de diálogo y dos personajes de juego que conversan. |
| 12 | si | descubrir qué clientes están por dejar de comprar | 650078 Analítica de Negocios | `user-minus` | Tarjetas de clientes en una pantalla, algunas marcadas en amarillo, y un gráfico que baja. |
| 13 | vj | dibujar en viñetas la historia de un juego | 550029 Narrativa Gráfica | `pencil` | Hoja con seis viñetas dibujadas a lápiz que cuentan una escena de juego. |
| 13 | ti | averiguar por dónde se coló un atacante | 650076 Tópicos Avanzados en Ciberseguridad | `footprints` | Muro digital de ladrillos con una grieta ya abierta y una lupa que sigue las huellas que entran por ella. |
| 14 | sw | programar una app que avisa cuándo pasa el bus | 650030 Programación Móvil | `bus` | Paradero con una persona que mira su celular, donde una app muestra el bus a dos cuadras. |

Cada tarea lleva un ícono de Lucide (lucide_icons_flutter 3.1.15) que representa la tarea y no la especialidad. El generador comprueba que cada nombre existe en `lucide-nombres.txt` con su constante de `LucideIcons`, que ninguna tarea usa el ícono de una especialidad y que ningún glifo se repite en el test, ni siquiera entre las dos tareas de un duelo o de un desempate.

### Balance

| | sw | ti | si | vj |
|---|---|---|---|---|
| Duelos | 5 | 5 | 5 | 5 |
| Arriba | 3 | 2 | 2 | 3 |
| Abajo | 2 | 3 | 3 | 2 |
| Escala en la pregunta | 14 | 4 | 12 | 8 |

| Par | Veces | Preguntas |
|---|---|---|
| sw-ti | 1 | 7 (sw arriba) |
| sw-si | 2 | 1 (sw arriba), 9 (si arriba) |
| sw-vj | 2 | 5 (vj arriba), 11 (sw arriba) |
| ti-si | 2 | 6 (si arriba), 10 (ti arriba) |
| ti-vj | 2 | 2 (ti arriba), 13 (vj arriba) |
| si-vj | 1 | 3 (vj arriba) |

| | sw | ti | si | vj |
|---|---|---|---|---|
| Lados en orden (A arriba, B abajo) | ABABA | ABBAB | BBAAB | BAABA |

Con 10 duelos y 5 apariciones por especialidad, cuatro pares salen dos veces y dos salen una, y esos dos no pueden compartir especialidad. Salen una vez sw-ti y si-vj, para que salgan dos veces los pares que más se confunden, que son sw-vj (comparten tres electivos), ti-si (comparten Arquitectura de TI) y sw-si (a un alumno nuevo le suenan parecido). ti-vj sale dos veces porque la cuenta lo exige. Ninguna especialidad sale en tres ítems seguidos, ninguna escala queda junto a un duelo de su misma especialidad y ninguna especialidad sale más de dos veces seguidas en el mismo lado. Dos ítems vecinos comparten especialidad solo 3 veces. Las tareas miden entre 11 y 14 palabras.

## Desempates

| Id | Par | Arriba | Abajo | Electivos | Íconos |
|---|---|---|---|---|---|
| tb-sw-ti-1 | sw-ti | **sw** Programar el sistema de citas de una clínica para que no se crucen horarios (14) | **ti** Elegir los servidores y la red que necesita una clínica nueva (11) | 650079, 650083 | `calendar-clock`, `hospital` |
| tb-sw-ti-2 | sw-ti | **ti** Cuidar que nadie entre a las cuentas de un banco con claves robadas (13) | **sw** Entrenar un programa que lea boletas escritas a mano y sume los montos (13) | 650076, 650075 | `key-round`, `receipt` |
| tb-sw-si-1 | sw-si | **sw** Ordenar el código de una app vieja para que sea fácil de cambiar (13) | **si** Revisar qué programas necesita cada área de una empresa para cumplir sus metas (13) | 650085, 650082 | `blocks`, `goal` |
| tb-sw-si-2 | sw-si | **si** Unir en una sola base de datos las ventas de todas las sedes (13) | **sw** Diseñar una app que un adulto mayor pueda usar sin pedir ayuda (12) | 650071, 650011 | `database`, `rocking-chair` |
| tb-sw-vj-1 | sw-vj | **sw** Programar cómo se reparten las canchas de fulbito para que no se crucen reservas (14) | **vj** Crear las reglas de un juego de mesa y probarlas con amigos (12) | 650072, 550090 | `land-plot`, `dices` |
| tb-sw-vj-2 | sw-vj | **vj** Programar la inteligencia de los enemigos para que persigan al jugador (11) | **sw** Entrenar un programa que recomiende canciones según lo que ya escuchaste (11) | 650081, 650075 | `ghost`, `headphones` |
| tb-ti-si-1 | ti-si | **ti** Detectar a un intruso en la red de una cadena de boticas y echarlo (14) | **si** Medir con datos si la promoción de una botica de verdad vendió más (13) | 650076, 650078 | `siren`, `badge-percent` |
| tb-ti-si-2 | ti-si | **si** Rediseñar los trámites de una municipalidad para que se hagan por internet sin colas (14) | **ti** Hacer que los servidores de una universidad aguanten la matrícula sin caerse (12) | 650080, 650077 | `stamp`, `graduation-cap` |
| tb-ti-vj-1 | ti-vj | **ti** Conectar las luces y cámaras de una casa para manejarlas desde el celular (13) | **vj** Inventar un personaje de juego con su historia, sus miedos y sus metas (13) | 650012, 550001 | `house-wifi`, `drama` |
| tb-ti-vj-2 | ti-vj | **vj** Diseñar un juego que enseñe a los niños a cuidar el agua (12) | **ti** Montar la red y el wifi de un evento para cinco mil personas (13) | 550090, 650073 | `droplet`, `radio-tower` |
| tb-si-vj-1 | si-vj | **si** Descubrir con datos qué platos se piden más en cada distrito de Lima (13) | **vj** Diseñar las misiones de un juego ambientado en el Centro de Lima (12) | 650044, 550090 | `soup`, `map-pinned` |
| tb-si-vj-2 | si-vj | **vj** Escribir los finales distintos de un juego según lo que decida el jugador (13) | **si** Recopilar los trucos de los boticarios veteranos en un buscador para todo el equipo (14) | 550001, 650074 | `split`, `pill-bottle` |

## Puntaje

- En cada duelo, la tarea elegida da 1 punto a su especialidad. «Me gustan las dos» da 0,5 a cada una. «Ninguna me llama» no suma a ninguna, pero el duelo cuenta como mostrado.
- Cada especialidad tiene una sola escala. Nada = 0, Un poco = 1, Bastante = 2, Me encantaría = 3.
- Afinidad. A = 0,7 · D + 0,3 · E. D = 100 · puntos / duelos, donde duelos son los duelos mostrados de esa especialidad (5, o 6 o 7 con desempates). E = 100 · valor / 3.
- Forma exacta. A = 35 · h / n + 10 · e, con h = medios puntos (2 por elección, 1 por «las dos»), n = duelos mostrados y e = valor de la escala. Con n = 5 queda A = 7 · h + 10 · e, siempre entero.
- Tras la pregunta 14 se ordenan las cuatro por afinidad. Si A(1.ª) − A(2.ª) ≤ 10, se muestra el desempate 1 del par formado por esas dos.
- Un duelo de desempate cuenta como cualquier duelo. Suma a los puntos y a los duelos mostrados de las dos especialidades del par, y no toca a las otras dos. Se recalcula A con la misma fórmula.
- Si después del desempate 1 la diferencia entre las dos del par sigue en 10 o menos, se muestra el desempate 2 del mismo par. No hay tercero.
- El par se nombra en el orden sw, ti, si, vj. El desempate 1 es el de order = 1 y el 2 el de order = 2; entre los dos alternan arriba y abajo.
- Si al final las dos primeras tienen exactamente la misma afinidad, el resultado es empate y se muestran las dos.
- Si en el desempate eligen «Ninguna me llama», las dos del par bajan y una tercera podría pasarlas. El resultado se ordena igual por afinidad y no se abren más desempates.
- Orden. A descendente, luego D descendente, luego valor de escala descendente, luego orden fijo sw, ti, si, vj. Los criterios 2 a 4 solo ordenan especialidades con la misma A, por ejemplo para elegir cuál entra al desempate o cuál se muestra segunda. El criterio 3 nunca llega a decidir, porque con la misma A y la misma D la escala también es igual. El orden fijo nunca decide al ganador, porque la igualdad exacta al final es empate.
- La afinidad se muestra redondeada a entero, con .5 hacia arriba. Todas las comparaciones usan el valor sin redondear. Con un desempate, A puede dejar de ser entera (35 · h / 6); con dos vuelve a serlo (35 · h / 7 = 5 · h). Conviene comparar con fracciones o con una tolerancia de 1e-9.

### Ejemplos

#### Ganadora clara, sin desempate (ejemplo-1)

Respuestas 1=top, 2=both, 3=bottom, 4=un_poco, 5=bottom, 6=top, 7=top, 8=un_poco, 9=both, 10=none, 11=top, 12=bastante, 13=top, 14=me_encantaria.

| Etapa | Puntos de duelo | Escala | Afinidad |
|---|---|---|---|
| tras la pregunta 14 | sw 4,5/5, ti 0,5/5, si 2,5/5, vj 1,5/5 | sw 3, ti 1, si 2, vj 1 | sw 93, ti 17, si 55, vj 31 |

Resultado sw 93 %, si 55 %, vj 31 %, ti 17 %. Plantillas strong, second, electives.

> En los duelos, Ingeniería de Software sumó 4,5 de 5 puntos, con tareas como programar la app de pedidos de una bodega y entrenar un programa que reconoce paltas maduras. Y a la idea de programar una app que avisa cuándo pasa el bus le dijiste «Me encantaría». Todo apunta para el mismo lado. Tu segunda opción es Sistemas de Información, con 55 %. Si te interesa, mira electivos como «Programación Móvil» y «Deep Learning».

#### Diferencia de 10 puntos exactos, dos desempates (ejemplo-2)

Respuestas 1=bottom, 2=bottom, 3=both, 4=nada, 5=top, 6=top, 7=top, 8=bastante, 9=top, 10=top, 11=bottom, 12=me_encantaria, 13=bottom, 14=un_poco. Desempates bottom, top.

| Etapa | Puntos de duelo | Escala | Afinidad |
|---|---|---|---|
| tras la pregunta 14 | sw 1/5, ti 2/5, si 3,5/5, vj 3,5/5 | sw 1, ti 0, si 3, vj 2 | sw 24, ti 28, si 79, vj 69 |
| desempate 1 (tb-si-vj-1), respuesta bottom | si 3,5/6, vj 4,5/6 |  | si 70,83, vj 72,5 (diferencia 1,67) |
| desempate 2 (tb-si-vj-2), respuesta top | si 3,5/7, vj 5,5/7 |  | si 65, vj 75 (diferencia 10) |

Resultado vj 75 %, si 65 %, ti 28 %, sw 24 %. Plantillas general, tiebreakPicked, second, electives.

> Desarrollo de Videojuegos sumó 5,5 de 7 puntos en los duelos, con tareas como diseñar niveles que se ponen difíciles poco a poco y programar cómo salta un personaje de juego. A la idea de programar un juego sencillo para celular le dijiste «Bastante». Con Sistemas de Información el resultado estaba muy parejo, y en el desempate te quedaste con escribir finales distintos según lo que decide el jugador. Tu segunda opción es Sistemas de Información, con 65 %. Si te interesa, mira electivos como «Proyecto de Videojuegos».

#### Un desempate basta (ejemplo-3)

Respuestas 1=top, 2=top, 3=none, 4=me_encantaria, 5=bottom, 6=top, 7=bottom, 8=un_poco, 9=both, 10=top, 11=top, 12=nada, 13=top, 14=bastante. Desempates bottom.

| Etapa | Puntos de duelo | Escala | Afinidad |
|---|---|---|---|
| tras la pregunta 14 | sw 3,5/5, ti 3/5, si 1,5/5, vj 1/5 | sw 2, ti 3, si 0, vj 1 | sw 69, ti 72, si 21, vj 24 |
| desempate 1 (tb-sw-ti-1), respuesta bottom | sw 3,5/6, ti 4/6 |  | sw 60,83, ti 76,67 (diferencia 15,83) |

Resultado ti 77 %, sw 61 %, vj 24 %, si 21 %. Plantillas general, tiebreakPicked, second, electives.

> Tecnologías de la Información sumó 4 de 6 puntos en los duelos, con tareas como vigilar con sensores la refrigeradora de una botica y automatizar las pruebas y la publicación de una app. A la idea de pasar a la nube los sistemas de diez pollerías le dijiste «Me encantaría». Con Ingeniería de Software el resultado estaba muy parejo, y en el desempate te quedaste con elegir los servidores y la red de una clínica. Tu segunda opción es Ingeniería de Software, con 61 %. Si te interesa, mira electivos como «Internet de las Cosas» y «DevOps».

#### Casi todo «Ninguna me llama», con dos desempates (ejemplo-4)

Respuestas 1=none, 2=none, 3=none, 4=un_poco, 5=none, 6=none, 7=bottom, 8=nada, 9=none, 10=none, 11=both, 12=nada, 13=none, 14=un_poco. Desempates none, none.

| Etapa | Puntos de duelo | Escala | Afinidad |
|---|---|---|---|
| tras la pregunta 14 | sw 0,5/5, ti 1/5, si 0/5, vj 0,5/5 | sw 1, ti 1, si 0, vj 0 | sw 17, ti 24, si 0, vj 7 |
| desempate 1 (tb-sw-ti-1), respuesta none | sw 0,5/6, ti 1/6 |  | sw 15,83, ti 21,67 (diferencia 5,83) |
| desempate 2 (tb-sw-ti-2), respuesta none | sw 0,5/7, ti 1/7 |  | sw 15, ti 20 (diferencia 5) |

Resultado ti 20 %, sw 15 %, vj 7 %, si 0 %. Plantillas low, tiebreakNoPick, electives.

> Ninguna especialidad te llamó con fuerza, y eso también es información. Tecnologías de la Información quedó arriba con 20 %, así que es un buen punto de partida para mirar cursos sin apuro. Con Ingeniería de Software el resultado estaba muy parejo, por eso vale la pena mirar las dos. Si te interesa, mira electivos como «DevOps».

#### Duelos mejor que la escala (ejemplo-5)

Respuestas 1=top, 2=bottom, 3=top, 4=nada, 5=top, 6=top, 7=none, 8=un_poco, 9=none, 10=none, 11=top, 12=bastante, 13=top, 14=bastante.

| Etapa | Puntos de duelo | Escala | Afinidad |
|---|---|---|---|
| tras la pregunta 14 | sw 2/5, ti 0/5, si 1/5, vj 4/5 | sw 2, ti 0, si 2, vj 1 | sw 48, ti 0, si 34, vj 66 |

Resultado vj 66 %, sw 48 %, si 34 %, ti 0 %. Plantillas duelsOverScale, electives.

> En los duelos, Desarrollo de Videojuegos sumó 4 de 5 puntos, con tareas como diseñar niveles que se ponen difíciles poco a poco y observar a jugadores probando un juego, pero a la idea de programar un juego sencillo para celular le dijiste «Un poco». Antes de decidir, vale la pena revisar sus cursos. Si te interesa, mira electivos como «Proyecto de Videojuegos» y «Diseño de Videojuegos».

#### La escala pesa más que los duelos (ejemplo-6)

Respuestas 1=top, 2=top, 3=none, 4=me_encantaria, 5=none, 6=top, 7=top, 8=nada, 9=none, 10=top, 11=none, 12=un_poco, 13=none, 14=un_poco.

| Etapa | Puntos de duelo | Escala | Afinidad |
|---|---|---|---|
| tras la pregunta 14 | sw 2/5, ti 2/5, si 1/5, vj 0/5 | sw 1, ti 3, si 1, vj 0 | sw 38, ti 58, si 24, vj 0 |

Resultado ti 58 %, sw 38 %, si 24 %, vj 0 %. Plantillas scaleOverDuels, electives.

> Tu «Me encantaría» a la idea de pasar a la nube los sistemas de diez pollerías pesó mucho en el resultado. En los duelos, Tecnologías de la Información sumó 2 de 5 puntos, con tareas como vigilar con sensores la refrigeradora de una botica y evitar que la web de un concierto se caiga. Si te interesa, mira electivos como «Internet de las Cosas» y «Sistemas Distribuidos».

#### Gana sin puntos en los duelos de las 14 preguntas (ejemplo-7)

Respuestas 1=top, 2=none, 3=none, 4=nada, 5=none, 6=none, 7=none, 8=nada, 9=bottom, 10=none, 11=none, 12=me_encantaria, 13=none, 14=un_poco. Desempates bottom, top.

| Etapa | Puntos de duelo | Escala | Afinidad |
|---|---|---|---|
| tras la pregunta 14 | sw 2/5, ti 0/5, si 0/5, vj 0/5 | sw 1, ti 0, si 3, vj 0 | sw 38, ti 0, si 30, vj 0 |
| desempate 1 (tb-sw-si-1), respuesta bottom | sw 2/6, si 1/6 |  | sw 33,33, si 41,67 (diferencia 8,33) |
| desempate 2 (tb-sw-si-2), respuesta top | sw 2/7, si 2/7 |  | sw 30, si 50 (diferencia 20) |

Resultado si 50 %, sw 30 %, ti 0 %, vj 0 %. Plantillas noMainPoints, tiebreakPicked.

> En las 14 preguntas, Sistemas de Información no sumó puntos en los duelos. La pusieron arriba tu «Me encantaría» a la idea de descubrir qué clientes están por dejar de comprar y lo que elegiste en los desempates. Con Ingeniería de Software el resultado estaba muy parejo, y en el desempate te quedaste con unir en una base de datos las ventas de todas las sedes.

#### Empate exacto tras dos desempates (ejemplo-8)

Respuestas 1=top, 2=top, 3=none, 4=bastante, 5=none, 6=bottom, 7=none, 8=un_poco, 9=bottom, 10=top, 11=top, 12=un_poco, 13=none, 14=bastante. Desempates both, both.

| Etapa | Puntos de duelo | Escala | Afinidad |
|---|---|---|---|
| tras la pregunta 14 | sw 3/5, ti 3/5, si 0/5, vj 0/5 | sw 2, ti 2, si 1, vj 1 | sw 62, ti 62, si 10, vj 10 |
| desempate 1 (tb-sw-ti-1), respuesta both | sw 3,5/6, ti 3,5/6 |  | sw 60,83, ti 60,83 (diferencia 0) |
| desempate 2 (tb-sw-ti-2), respuesta both | sw 4/7, ti 4/7 |  | sw 60, ti 60 (diferencia 0) |

Resultado sw 60 %, ti 60 %, si 10 %, vj 10 % (empate). Plantillas tie.

> En los duelos, Ingeniería de Software sumó 4 de 7 puntos y Tecnologías de la Información, 4 de 7. Quedaron empatadas, así que mira los cursos de las dos y quédate con la que más te provoque.

## Motivos sin IA

Se toma la primera plantilla de «main» cuya condición se cumpla. Luego se agregan, en este orden y solo si su condición se cumple, una de «tiebreak», la de «second» y la de «electives». Las oraciones se unen con un espacio. Si el resultado es empate, se usa solo «tie».

| Grupo | Id | Condición | Texto |
|---|---|---|---|
| main | low | `A < 50` | Ninguna especialidad te llamó con fuerza, y eso también es información. {nombre} quedó arriba con {afinidad} %, así que es un buen punto de partida para mirar cursos sin apuro. |
| main | noMainPoints | `tareas == ''` | En las 14 preguntas, {nombre} no sumó puntos en los duelos. La pusieron arriba tu «{escalaRespuesta}» a la idea de {escalaTarea} y lo que elegiste en los desempates. |
| main | strong | `D >= 80 && e >= 2` | En los duelos, {nombre} sumó {puntos} de {duelos} puntos, con tareas como {tareas}. Y a la idea de {escalaTarea} le dijiste «{escalaRespuesta}». Todo apunta para el mismo lado. |
| main | duelsOverScale | `D >= 60 && e <= 1` | En los duelos, {nombre} sumó {puntos} de {duelos} puntos, con tareas como {tareas}, pero a la idea de {escalaTarea} le dijiste «{escalaRespuesta}». Antes de decidir, vale la pena revisar sus cursos. |
| main | scaleOverDuels | `e == 3 && D < 60` | Tu «Me encantaría» a la idea de {escalaTarea} pesó mucho en el resultado. En los duelos, {nombre} sumó {puntos} de {duelos} puntos, con tareas como {tareas}. |
| main | general | `true` | {nombre} sumó {puntos} de {duelos} puntos en los duelos, con tareas como {tareas}. A la idea de {escalaTarea} le dijiste «{escalaRespuesta}». |
| tiebreak | tiebreakPicked | `huboDesempate && ganadoraEnElPar && tareaDesempate != ''` | Con {rival} el resultado estaba muy parejo, y en el desempate te quedaste con {tareaDesempate}. |
| tiebreak | tiebreakNoPick | `huboDesempate && ganadoraEnElPar` | Con {rival} el resultado estaba muy parejo, por eso vale la pena mirar las dos. |
| second | second | `A2 >= 50` | Tu segunda opción es {segunda}, con {afinidadSegunda} %. |
| electives | electives | `electivos != ''` | Si te interesa, mira electivos como {electivos}. |
| tie | tie | `empate` | En los duelos, {a} sumó {puntosA} de {duelosA} puntos y {b}, {puntosB} de {duelosB}. Quedaron empatadas, así que mira los cursos de las dos y quédate con la que más te provoque. |

| Variable | Significado |
|---|---|
| `{nombre}` | Nombre oficial de la especialidad ganadora. |
| `{afinidad}` | Afinidad de la ganadora redondeada a entero (sin el signo %; la plantilla lo agrega). |
| `{puntos}` | Puntos de duelo de la ganadora con coma decimal, como «4» o «3,5». |
| `{duelos}` | Duelos en los que apareció la ganadora, contando desempates (5, 6 o 7). |
| `{tareas}` | Hasta dos resúmenes de tareas de la ganadora que el alumno eligió en duelos principales. Primero las que ganó sola, en orden de pregunta; después las de «Me gustan las dos». Se unen con « y ». |
| `{escalaTarea}` | Resumen de la tarea de la escala de la ganadora. |
| `{escalaRespuesta}` | Etiqueta que eligió en esa escala (Nada, Un poco, Bastante o Me encantaría). |
| `{rival}` | La otra especialidad del desempate. |
| `{tareaDesempate}` | Resumen de la última tarea de desempate que eligió sola y que era de la ganadora; vacío si no la hay. |
| `{segunda}` | Nombre de la segunda especialidad. |
| `{afinidadSegunda}` | Afinidad de la segunda redondeada a entero. |
| `{electivos}` | Nombres cortos, entre comillas latinas, del primer electivo de cada tarea de {tareas}, sin repetir, unidos con « y ». |
| `{a}, {b}, {puntosA}, {duelosA}, {puntosB}, {duelosB}` | Solo para el empate final. Son las dos especialidades y sus puntos y duelos. |
| `A` | Afinidad de la ganadora, sin redondear. |
| `D` | Porcentaje de duelos de la ganadora (100 · puntos / duelos). |
| `e` | Valor de la escala de la ganadora (0 a 3). |
| `A2` | Afinidad de la segunda, sin redondear. |
| `tareas` | Valor de {tareas}; queda vacío solo si la ganadora no sumó nada en los 10 duelos de las 14 preguntas. |
| `huboDesempate` | Se mostró al menos un desempate. |
| `ganadoraEnElPar` | La ganadora es una de las dos especialidades del desempate. |
| `empate` | Las dos primeras terminaron con la misma afinidad exacta. |

- {tareas} solo sale de los 10 duelos de las 14 preguntas, y queda vacío si la ganadora no sumó nada en ellos. Con A < 50 lo cubre «low»; con A ≥ 50 pasa en un solo caso, el de escala 3 y los dos desempates elegidos a su favor (A = 20 + 30 = 50), y para ese caso está «noMainPoints».
- «duelsOverScale» usa «pero» porque su condición exige Nada o Un poco en la escala. «scaleOverDuels» dice que la escala pesó mucho porque con e = 3 y D < 60 la escala aporta 30 puntos y los duelos menos de 42.
- Las condiciones usan valores sin redondear. Solo {afinidad} y {afinidadSegunda} se redondean.
- Los resúmenes ya vienen en minúscula y en infinitivo, listos para ir después de «como» o de «la idea de».

## Líneas de Ulises

| Momento | Texto |
|---|---|
| Bienvenida 1 | ¡Hola! Soy Ulises. Te voy a mostrar tareas de verdad, de las que se hacen en cada especialidad, y tú eliges cuál harías con más ganas. |
| Bienvenida 2 | Son 14 preguntas, a veces una o dos más para desempatar, y te toma unos tres minutos. No hay respuestas buenas ni malas. |
| Bienvenida 3 | Piensa en lo que harías con gusto un día cualquiera, no en lo que suena más importante. |
| Bienvenida 4 | Si te gustan las dos, dilo. Si ninguna te llama, también vale. |
| Botón | Vamos |
| Ayuda en duelos | Toca la tarea que harías con más ganas. |
| Ayuda en escalas | Elige cuánto te gustaría hacer esta tarea. |
| Reacción (pick) | Anotado. / ¡Cra! / Listo. / Ya, siguiente. / Lo apunto. / Sigamos. / Tomo nota. |
| Reacción (both) | Las dos, ¿no? Eso también cuenta. / Ya, medio punto para cada una. |
| Reacción (none) | Ninguna, ya. También me sirve saberlo. / Ok, ninguna de las dos era lo tuyo. |
| Reacción (scale) | Anotado. / Lo tengo. / ¡Cra! |
| Resultado (loading) | Dame un toque que junto tus respuestas. |
| Resultado (intro) | Ya tengo tu resultado. |
| Resultado (winner) | Lo tuyo apunta a {nombre}, con {afinidad} % de afinidad. |
| Resultado (second) | En segundo lugar quedó {segunda}, con {afinidadSegunda} %. |
| Resultado (tie) | Empate. {a} y {b} quedaron igualitas, con {afinidad} %. |
| Resultado (low) | Esta vez ninguna despegó del todo. Por ahora, {nombre} va adelante, con {afinidad} %. |
| Resultado (closing) | Tómalo como una brújula, no como una sentencia. La mayoría de electivos se abren al terminar el quinto ciclo, así que tienes tiempo para explorar. |
| Resultado (retake) | Si más adelante cambias de idea, puedes volver a hacer el test. |
| Resultado (retakeNote) | Usar solo si la app deja repetir el test. |
| Desempate (first) | Tienes dos especialidades muy parejas. Te hago una pregunta más para desempatar. |
| Desempate (second) | Sigue reñido. Una última y listo. |
| Desempate (resolved) | Ahí está, ya se inclinó la balanza. |
| Desempate (stillTied) | Ni así se separan. Te muestro las dos. |

Si la pregunta trae su propia reacción, esa va primero. Estas son para variar o para cuando no hay línea propia. Ninguna felicita una elección ni nombra especialidades durante el test, y el anuncio del desempate tampoco las nombra, para no delatar de quién es cada tarea. La línea first va antes del desempate 1 y second antes del desempate 2. Al terminar los desempates, stillTied va solo si hay empate exacto (las dos primeras con la misma afinidad sin redondear); en cualquier otro caso va resolved.

## Pautas

- Tareas de 6 a 14 palabras, en infinitivo, con un escenario que se pueda imaginar.
- Sin jerga difícil, sin dos puntos ni guiones largos.
- Trato de tú y lenguaje neutro en género.
- Ulises no nombra especialidades ni felicita elecciones durante el test.
- Ilustración plana, sin texto legible, sin logos ni marcas reales y sin personas reconocibles. El color de acento es el de la especialidad solo después de revelar el resultado; durante el test las dos tarjetas usan el mismo estilo neutro para no delatar a qué especialidad pertenecen.
