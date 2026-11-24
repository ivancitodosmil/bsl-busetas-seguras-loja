// Arranca Expo anunciando la IP del Wi-Fi.
// Expo elige a veces la IP de un adaptador virtual (VirtualBox 192.168.56.x, Hyper-V, WSL, Docker)
// y el celular no puede llegar a ella: Expo Go muestra "Something went wrong".
// Uso: npm start  (los argumentos extra pasan a expo, p. ej. npm start -- -c)
const os = require('os');
const { spawn } = require('child_process');

const VIRTUAL = /virtualbox|vmware|vethernet|hyper-v|wsl|docker|loopback|bluetooth|tailscale|zerotier/i;
const WIFI = /wi-?fi|wlan|inal[aá]mbrica|wireless/i;

function candidatas() {
  const lista = [];
  for (const [nombre, direcciones] of Object.entries(os.networkInterfaces())) {
    for (const d of direcciones ?? []) {
      if (d.family !== 'IPv4' && d.family !== 4) continue;
      if (d.internal || d.address.startsWith('169.254.')) continue;
      if (VIRTUAL.test(nombre) || d.address.startsWith('192.168.56.')) continue;
      lista.push({ nombre, ip: d.address, wifi: WIFI.test(nombre) });
    }
  }
  return lista.sort((a, b) => Number(b.wifi) - Number(a.wifi));
}

const args = process.argv.slice(2);
const usaTunel = args.includes('--tunnel');
const env = { ...process.env };

if (!usaTunel && !env.REACT_NATIVE_PACKAGER_HOSTNAME) {
  const [elegida, ...resto] = candidatas();
  if (elegida) {
    env.REACT_NATIVE_PACKAGER_HOSTNAME = elegida.ip;
    console.log(`\nBSL · anunciando ${elegida.ip} (${elegida.nombre}). El celular debe estar en esa misma red.`);
    if (resto.length) console.log(`     Otras redes: ${resto.map((r) => `${r.ip} (${r.nombre})`).join(', ')}`);
    console.log('     Si aun así no conecta (redes de la universidad suelen aislar equipos): npm run tunel\n');
  } else {
    console.log('\nBSL · no encontré una red Wi-Fi; Expo elegirá la IP por su cuenta.\n');
  }
}

// Sin --offline, Expo CLI se detiene a pedir el correo de una cuenta de Expo cuando el celular
// abre el proyecto, y Expo Go se queda en blanco. En la misma red no hace falta cuenta.
if (!usaTunel && !args.includes('--offline')) args.push('--offline');

const hijo = spawn('npx', ['expo', 'start', ...args], { stdio: 'inherit', env, shell: true });
hijo.on('exit', (codigo) => process.exit(codigo ?? 0));
