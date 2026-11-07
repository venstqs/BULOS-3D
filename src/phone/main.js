import qrcode from 'qrcode-generator';
import './phone.css';

// The app screen this computer asked for, e.g. #/app/forecast
const wanted = decodeURIComponent(window.location.hash.slice(1));
const path = wanted.startsWith('/app') ? wanted : '/app/';
document.getElementById('app').src = path;

const code = qrcode(0, 'M');
code.addData(new URL(path, window.location.href).href);
code.make();
document.getElementById('qr').innerHTML = code.createSvgTag({ cellSize: 4, margin: 0, scalable: true });

// Keep the whole phone on screen, at any window height
const phone = document.getElementById('phone');
const fit = () => { phone.style.setProperty('--fit', Math.min(1, (window.innerHeight - 48) / 864)); };
window.addEventListener('resize', fit);
fit();
