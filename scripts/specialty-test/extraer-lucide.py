# Extrae de lucide_icons_flutter 3.1.15 la lista de íconos válidos que usa generar.py.
# Cada línea de lucide-nombres.txt trae el nombre de Lucide (kebab-case), la constante de Flutter
# (camelCase, sin el prefijo LucideIcons.) y el punto de código del glifo en la fuente Lucide.
# Dos nombres con el mismo punto de código son alias del mismo glifo.
import re, sys
from pathlib import Path

ORIGEN = Path.home() / ".pub-cache/hosted/pub.dev/lucide_icons_flutter-3.1.15/lib/lucide_icons.dart"
DESTINO = Path(__file__).parent / "lucide-nombres.txt"

lineas = ORIGEN.read_text(encoding="utf-8").split("\n")
nombre_re = re.compile(r"^  /// ([a-z0-9]+(?:-[a-z0-9]+)*)$")
const_re = re.compile(r"^  static const IconData ([A-Za-z0-9]+) = const IconData\((\d+),")
filas = []
for i, linea in enumerate(lineas):
    m = nombre_re.match(linea)
    if not m:
        continue
    for siguiente in lineas[i + 1:i + 6]:
        c = const_re.match(siguiente)
        if c:
            filas.append((m.group(1), c.group(1), int(c.group(2))))
            break
    else:
        sys.exit(f"sin constante para {m.group(1)}")

def camel(k):
    p = k.split("-")
    return p[0] + "".join(x[:1].upper() + x[1:] for x in p[1:])

assert all(camel(k) == c for k, c, _ in filas), "una constante no sigue el camelCase del nombre"
assert len({k for k, _, _ in filas}) == len(filas), "nombre repetido"
cabecera = [
    "# Íconos de lucide_icons_flutter 3.1.15 (lib/lucide_icons.dart), extraídos con extraer-lucide.py.",
    f"# {len(filas)} nombres y {len({cp for _, _, cp in filas})} glifos. Columnas separadas por tabulador:",
    "# nombre de Lucide, constante de LucideIcons y punto de código del glifo.",
]
DESTINO.write_text("\n".join(cabecera + [f"{k}\t{c}\t{cp}" for k, c, cp in filas]) + "\n", encoding="utf-8")
print(f"{len(filas)} íconos en {DESTINO.name}")
