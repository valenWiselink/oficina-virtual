# Oficina virtual

Todos tus agentes de Claude Code en una sola ventana: quién está trabajando,
quién te necesita (un permiso, una pregunta, un PR para revisar) y qué hizo
cada uno en el día. Les escribís desde un chat o desde su terminal, sin
cambiar de ventana.

- **Tablero**: los agentes por estado (Te necesita, Trabajando, Terminó, Sin tarea).
- **Grafo**: quién trabaja con quién, con sus subagentes y las juntas.
- **Historial**: tu día contado por proyecto (qué se terminó, los PRs, lo que te
  dejaron), el detalle con la hora y la lista de PRs.
- **Espacios de trabajo**: separá agentes por proyecto o cliente ("Wiselink",
  "Personal"…); cada espacio muestra sólo los suyos en todas las vistas, y su
  pestaña avisa con un número cuando alguno te necesita.

## Instalar con el instalador (.exe) — lo más fácil

1. Bajá `Oficina-virtual-Setup-<versión>.exe` de la
   [última versión](https://github.com/valenWiselink/oficina-virtual/releases/latest)
   y hacé doble clic. Se instala solo
   para tu usuario (no pide permisos de administrador) y crea el acceso
   **Oficina virtual** en el escritorio y en el menú Inicio.
2. Windows puede mostrar "Windows protegió su PC" porque el instalador no está
   firmado: tocá **Más información → Ejecutar de todas formas**.
3. La oficina se abre sola. La primera vez te muestra una presentación animada
   (con sonido) de unos 40 segundos y después te guía: revisa que Claude Code esté instalado, te
   ofrece los avisos al instante, elegís tu carpeta y creás tu primer agente.

No hace falta instalar Node: el programa trae lo suyo. Sí hace falta **Claude
Code** con tu sesión iniciada. Si no lo tenés, en PowerShell:
`irm https://claude.ai/install.ps1 | iex` (el instalador oficial), y después
entrá una vez con `claude` para iniciar sesión.

- Cerrar la ventana **no** apaga la oficina: queda en la bandeja del sistema
  (al lado del reloj) y tus agentes siguen trabajando. Para apagarla: clic
  derecho en el ícono de la bandeja → **Apagar la oficina**, o Ajustes →
  Apagar la oficina.
- Si ya tenés una oficina corriendo (por ejemplo la del navegador), el
  programa se conecta a esa en vez de abrir otra.
- Lo que pasa por dentro queda en `%APPDATA%\Oficina virtual\logs`.
- Para desinstalar: Configuración de Windows → Aplicaciones → Oficina virtual.
  También saca los avisos (hooks) que había agregado a Claude Code.

### Actualizaciones

El programa busca versiones nuevas en los
[Releases de este repo](https://github.com/valenWiselink/oficina-virtual/releases)
al abrirse y desde la bandeja (**Buscar actualizaciones**). Si hay una, la baja
sola y te ofrece instalarla; tus agentes se retoman solos. Para eso el repo
tiene que ser público.

Para publicar una versión nueva:

1. Subí la versión en `electron-builder.yml` (`extraMetadata.version`, por ejemplo `1.0.1`).
2. `npm run dist:win` deja en `release/` el `.exe`, su `.blockmap` y `latest.yml`.
3. Publicalos juntos (los tres hacen falta para que el programa se actualice):

   ```powershell
   gh release create v1.0.1 release/Oficina-virtual-Setup-1.0.1.exe release/Oficina-virtual-Setup-1.0.1.exe.blockmap release/latest.yml --title "Oficina virtual 1.0.1" --notes "Qué cambió"
   ```

Para probar con otro lugar de descarga: abrí la oficina con
`OFICINA_UPDATE_URL=https://…/carpeta/` (una carpeta con el `.exe` y su `latest.yml`).

### Armar el instalador

```powershell
npm install
npm run dist:win      # -> release\Oficina-virtual-Setup-<versión>.exe
npm run pack:win      # sin instalador: release\win-unpacked\Oficina virtual.exe
```

Para probarlo sin tocar tu oficina: `OFICINA_PORT=3195` abre la del programa en
otro puerto.

## Instalar desde el código (Windows)

Necesitás:

- **Node.js 20 o más nuevo**. Si no lo tenés: `winget install OpenJS.NodeJS.LTS`
- **Claude Code** con tu sesión iniciada. Si no lo tenés:
  `npm install -g @anthropic-ai/claude-code`, y después entrá una vez con
  `claude` en una terminal para iniciar sesión.

Después, en la carpeta de este repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

El instalador baja las dependencias, compila y crea el acceso directo
**Oficina virtual** en el escritorio y en el menú Inicio. Al final te ofrece
agregar a tu `~/.claude/CLAUDE.md` una regla para que los agentes te avisen
con una línea `Te toca: ...` cuando te dejan algo para hacer.

## Usarla

Abrila con el acceso **Oficina virtual**. La primera vez te guía: revisa que
Claude Code esté instalado, te ofrece activar los avisos al instante, elegís
la carpeta de tu proyecto y creás tu primer agente. Después hay un recorrido
corto por la pantalla (la guía y la presentación se vuelven a ver en Ajustes →
Ayuda).

- **+ Agente**: arranca un Claude nuevo en una carpeta, con el modelo y el
  esfuerzo que elijas (o «como siempre»).
- **Editar** (el lápiz de la tarjeta): nombre y color de cualquier agente; modelo,
  esfuerzo y supervisión de los que corren en la oficina (los reinicia en la misma
  conversación, así que tienen que estar quietos). Un modelo más grande es un
  Clawd más grande, y el esfuerzo se ve en su vincha.
- **Supervisores**: cualquier agente puede supervisar un espacio, agentes elegidos
  o a todos. Le llegan los permisos, las preguntas y los turnos terminados de su
  equipo; aprueba lo seguro, te pide lo demás con un «Te toca» y te cuenta qué hizo
  cada uno. Lo peligroso (push, borrar, publicar, migraciones, deploys) siempre te
  lo pide a vos: la oficina no lo deja aprobarlo.
- Las rutas de archivos en la terminal se abren con un clic en el Explorador.
- Cerrar la ventana **no** apaga la oficina: tus agentes siguen trabajando.
  Para apagarla: Ajustes → Apagar la oficina.
- **Espacios**: el «+» de arriba a la izquierda crea uno; elegís qué carpetas
  entran solas, y cualquier agente se mueve con «Mover a…» en su tarjeta.
- Atajos: `Alt+N` va al próximo agente que te necesita (aunque esté en otro
  espacio); `Alt+1…9` a cada agente; `Ctrl+K` busca agentes y acciones.

## Actualizar

```powershell
git pull
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

Si estaba abierta, apagala desde Ajustes y volvé a abrirla.

## Si algo no anda

- Lo que imprime el servidor queda en `~/.pixel-agents/oficina.log`.
- El agente no arranca: revisá que `claude` funcione en una terminal común.
- La oficina se entera tarde de los permisos: activá Ajustes → Detección al instante.

## Origen

Es un fork de [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)
(licencia MIT, ver `LICENSE`), rehecho como tablero y grafo en lugar de la
oficina pixel art.
