"""Utilities for generating markdown coverage reports for RLS policies.

The script scans `database/schema/*.sql` for `CREATE POLICY` statements and
compares them against the checked-in Supabase migrations. It rewrites
`backlog/db_dump_analysis_policies.md` with a complete coverage table.
"""

import re
from pathlib import Path
from typing import List, Sequence, Tuple

SCHEMA_DIR = Path("database/schema")
MIGRATIONS_DIR = Path("supabase/migrations")
OUTPUT_PATH = Path("backlog/db_dump_analysis_policies.md")

POLICY_PATTERN = re.compile(
    r"create\s+policy\s+(?:\"([^\"]+)\"|([\w-]+))\s+on\s+([\w\.\"]+)",
    re.IGNORECASE,
)


def _read_migrations() -> str:
    if not MIGRATIONS_DIR.exists():
        return ""
    return "\n".join(path.read_text() for path in MIGRATIONS_DIR.glob("*.sql"))


def _collect_policy_rows(
    migration_text: str,
) -> Tuple[
    List[Tuple[str, List[Tuple[str, str, bool]]]], int, List[Tuple[str, str, str]]
]:
    sections: List[Tuple[str, List[Tuple[str, str, bool]]]] = []
    unique: set[Tuple[str, str]] = set()
    missing: List[Tuple[str, str, str]] = []

    for path in sorted(SCHEMA_DIR.glob("*.sql")):
        text = path.read_text()
        rows: List[Tuple[str, str, bool]] = []
        for match in POLICY_PATTERN.finditer(text):
            name = match.group(1) or match.group(2)
            table = match.group(3)
            key = (name, table)
            unique.add(key)
            name_pattern = re.compile(
                rf"create\s+policy\s+\"?{re.escape(name)}\"?",
                re.IGNORECASE,
            )
            in_migrations = bool(name_pattern.search(migration_text))
            rows.append((name, table, in_migrations))
            if not in_migrations:
                missing.append((name, table, path.name))
        sections.append((path.name, rows))

    return sections, len(unique), missing


def _render_table(rows: Sequence[Tuple[str, str, bool]]) -> List[str]:
    lines = ["| Policy | Table | In migrations? |\n", "| --- | --- | --- |\n"]
    for name, table, flag in rows:
        status = "✅" if flag else "❌"
        lines.append(f"| `{name}` | `{table}` | {status} |\n")
    return lines


def generate_policy_report(output_path: Path = OUTPUT_PATH) -> None:
    migration_text = _read_migrations()
    sections, unique_count, missing = _collect_policy_rows(migration_text)

    lines: List[str] = []
    lines.append("# DB Dump Analysis – Policies\n")
    lines.append("## Summary\n\n")
    lines.append(
        f"- Unique policy declarations under `database/schema`: **{unique_count}** across seven module files plus the `000_baseline.sql` snapshot.\n"
    )
    if missing:
        lines.append(
            f"- Missing policy definitions in migrations: **{len(missing)}** (detailed below).\n"
        )
    else:
        lines.append(
            "- Every policy definition is present in `supabase/migrations/`.\n"
        )
    lines.append(
        "- Supabase-managed policies (profiles, storage, auth) appear both in the baseline dump and in their module-specific files; duplication is expected.\n\n"
    )

    if missing:
        lines.append("### Missing policy coverage\n\n")
        lines.append("| Policy | Table | Declared in |\n")
        lines.append("| --- | --- | --- |\n")
        for name, table, filename in missing:
            lines.append(f"| `{name}` | `{table}` | `{filename}` |\n")
        lines.append("\n")
    else:
        lines.append(
            "> No gaps detected: migrations recreate all row level security policies from the schema dump.\n\n"
        )

    for file_name, rows in sections:
        lines.append(f"### `{file_name}`\n")
        lines.extend(_render_table(rows))
        lines.append("\n")

    output_path.write_text("".join(lines), encoding="utf-8")


if __name__ == "__main__":
    generate_policy_report()
