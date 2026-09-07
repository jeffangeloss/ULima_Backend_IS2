#!/usr/bin/env python3
"""Comprueba que los conteos del README coincidan con el código.

El README es documentación de referencia: cita números exactos (35 tablas, 16
módulos, 74 endpoints...) y rutas `archivo:línea`. Eso envejece mal — el
2026-09-07 se descubrió que dos merges lo habían dejado con quince cifras
falsas, y una de ellas anunciaba en un repo público un agujero de seguridad
que no existía.

Este script mide el código y compara. Correrlo antes de publicar cambios
grandes; falla con estado 1 si algo no cuadra.

    python3 scripts/verificar-readme.py

No tiene dependencias: usa solo la librería estándar, porque `bun` no siempre
está instalado y esto tiene que poder correrse siempre.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
README = RAIZ / "README.md"

# Métodos HTTP que declaran una ruta. Se exige que la llamada esté al principio
# de la línea (tras la sangría) para no contar `c.get("param")` ni `Map.get(...)`.
RUTA = re.compile(r"^\s*[A-Za-z_][\w.]*\.(get|post|put|patch|delete)\(", re.M)


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8") if ruta.exists() else ""


def contar(patron: str, texto: str) -> int:
    # re.M porque casi todos los patrones anclan en ^ y buscan por línea.
    return len(re.findall(patron, texto, re.M))


def medir() -> dict[str, int]:
    """Los números reales, medidos sobre el código de este árbol."""
    schema = leer(RAIZ / "src/db/schema/schema.ts")
    indice = leer(RAIZ / "src/modules/index.ts")
    env = leer(RAIZ / "src/config/env.ts")

    rutas = sorted((RAIZ / "src/modules").rglob("*.routes.ts"))
    # Las tres de servicio (`/`, `/health`, `/version`) viven en server.ts y no
    # en un *.routes.ts, así que van aparte o el total no cuadra.
    endpoints = sum(len(RUTA.findall(leer(f))) for f in rutas) + 3

    parsers = leer(RAIZ / "src/modules/portal-sync/parsers/index.ts")

    return {
        "tablas": contar(r"pgTable\(", schema),
        "enums": contar(r"pgEnum\(", schema),
        "modulos": contar(r"app\.route\(", indice),
        "archivos_rutas": len(rutas),
        "endpoints": endpoints,
        "migraciones": len(list((RAIZ / "drizzle").glob("*.sql"))),
        "suites": len(list((RAIZ / "test").rglob("*.test.ts"))),
        "specs": len(list((RAIZ / "specs").rglob("*.spec.md"))),
        "variables_entorno": contar(r"^\s+[A-Z][A-Z0-9_]*:\s*z\.", env),
        # Por función exportada, no por línea: una sola línea puede exportar dos
        # (`parseImpedimentos, parseInfoAcademica`) y `export * from "./html.js"`
        # no es un parser sino el ayudante de HTML que usan los demás.
        "parsers": len(set(re.findall(r"\bparse[A-Z]\w*", parsers))),
        "seeds": len(list((RAIZ / "src/db/seed").glob("*.ts"))),
    }


# Cada afirmación del README que cita un número. El grupo 1 de la expresión es
# la cifra. Si el README se reescribe y la frase cambia, el patrón deja de
# encontrarla: por eso una afirmación NO ENCONTRADA también se reporta.
AFIRMACIONES: list[tuple[str, str, str]] = [
    ("tablas", r"Drizzle_·_(\d+)_tablas", "insignia del ORM"),
    ("tablas", r"\*\*(\d+) tablas\*\* en `src/db/schema/schema\.ts`", "tabla de metadatos"),
    ("tablas", r"### Las (\d+) tablas", "título de la sección de tablas"),
    ("enums", r"### Los (\d+) enums", "título de la sección de enums"),
    ("modulos", r"(\d+)_módulos_·", "insignia de superficie"),
    ("modulos", r"\*\*(\d+) módulos\*\* ·", "tabla de metadatos"),
    ("modulos", r"### Los (\d+) módulos", "título de la sección de módulos"),
    ("endpoints", r"·_(\d+)_endpoints", "insignia de superficie"),
    ("endpoints", r"### El catálogo: (\d+) endpoints", "título del catálogo"),
    ("migraciones", r"(\d+) archivos de migración", "tabla de metadatos"),
    ("suites", r"(\d+)_suites", "insignia de verificación"),
    ("parsers", r"portal-sync<br/>(\d+) parsers", "diagrama de origen de datos"),
]


# El README cita a propósito rutas que NO existen, para explicar que una spec
# enlaza mal o que un snapshot se perdió. Delatarlas sería ruido, así que se
# ignora la cita cuando su línea la niega explícitamente.
NEGACION = re.compile(r"no existe|nunca existió|que no existen|se perdió|huérfan")
EXTENSIONES = (".ts", ".dart", ".sql", ".json", ".md", ".py", ".yml", ".yaml")


def rutas_citadas(texto: str) -> list[str]:
    """Rutas de archivo que el README menciona y que deberían existir."""
    patron = re.compile(r"`((?:src|test|specs|drizzle|scripts)/[\w./-]+)`?")
    encontradas: set[str] = set()
    # Por párrafo y no por línea: una frase como «enlazan rutas de test que no
    # existen (...)» parte la enumeración en varias líneas, y la negación vive
    # solo en la primera.
    for parrafo in re.split(r"\n\s*\n", texto):
        if NEGACION.search(parrafo):
            continue
        for m in patron.finditer(parrafo):
            ruta = m.group(1)
            if ruta.endswith(EXTENSIONES):
                encontradas.add(ruta)
    return sorted(encontradas)


def main() -> int:
    if not README.exists():
        print("No encuentro README.md", file=sys.stderr)
        return 1

    texto = README.read_text(encoding="utf-8")
    real = medir()
    fallos = 0

    print("Números medidos en el código:")
    for clave, valor in real.items():
        print(f"  {clave:20} {valor}")

    print("\nAfirmaciones del README:")
    for clave, patron, donde in AFIRMACIONES:
        encontrado = re.search(patron, texto)
        if not encontrado:
            print(f"  ? {clave:20} no encontré la frase de «{donde}» — ¿se reescribió?")
            fallos += 1
            continue
        dice = int(encontrado.group(1))
        if dice == real[clave]:
            print(f"  ✓ {clave:20} {dice} ({donde})")
        else:
            print(f"  ✗ {clave:20} dice {dice}, son {real[clave]} ({donde})")
            fallos += 1

    print("\nRutas de archivo citadas:")
    faltan = [r for r in rutas_citadas(texto) if not (RAIZ / r).exists()]
    if faltan:
        for r in faltan:
            print(f"  ✗ {r} — citada en el README pero no existe")
        fallos += len(faltan)
    else:
        print("  ✓ todas existen")

    print()
    if fallos:
        print(f"{fallos} discrepancia(s). El README no está al día.")
        return 1
    print("El README concuerda con el código.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
