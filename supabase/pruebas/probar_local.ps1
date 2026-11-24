# Prueba el esquema de BSL en un PostgreSQL local (no toca Supabase).
# Uso:  powershell -File probar_local.ps1
$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$dir = Split-Path -Parent $PSScriptRoot
$env:PGCLIENTENCODING = 'UTF8'
& $psql -U postgres -h localhost -w -q -c 'drop database if exists bsl_test' -c 'create database bsl_test'
$archivos = @(
  "$PSScriptRoot\00_simular_supabase.sql",
  "$dir\01_esquema.sql",
  "$dir\02_funciones_y_seguridad.sql",
  "$dir\03_datos_demo.sql",
  "$dir\02_funciones_y_seguridad.sql",   # segunda pasada: debe poder re-ejecutarse
  "$dir\03_datos_demo.sql",
  "$PSScriptRoot\90_escenarios.sql"
)
foreach ($f in $archivos) {
  Write-Output "── $(Split-Path -Leaf $f)"
  & $psql -U postgres -h localhost -w -q -v ON_ERROR_STOP=1 -d bsl_test -f $f
  if ($LASTEXITCODE -ne 0) { Write-Output "ERROR en $f"; exit 1 }
}
