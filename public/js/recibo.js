/**
 * recibo.js — Recibo / comprobante imprimible (21 cm × 7.5 cm).
 *
 * Replica el "Talón de referencia" del Excel del Diario y el formato de la
 * papelería de "Rincón de las Maravillas" (foto de referencia): una hoja
 * apaisada partida por una línea perforada en dos mitades:
 *   • izquierda  = TALÓN (lo conserva la administración) · "Recibí Comprobante"
 *   • derecha    = COPIA DEL CLIENTE · "Firma de Recibido"
 * Ambas con el logo (sin modificar, recortado de la foto) y los mismos datos:
 *   Recibo, Fecha, Lote, Concepto, Pago(método), Nombre, Cantidad + en letra, Autorizó.
 *
 * Sirve para INGRESOS (recibo de pago) y GASTOS (comprobante de egreso).
 */

import { money, prettyDate, esc } from './utils.js';

// ---------- Número a letras (español, formato moneda) ----------
const UNI = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function centenas(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  let s = '';
  const c = Math.floor(n / 100), r = n % 100;
  if (c) s += CEN[c] + (r ? ' ' : '');
  if (r) {
    if (r < 30) s += UNI[r];
    else { const d = Math.floor(r / 10), u = r % 10; s += DEC[d] + (u ? ' y ' + UNI[u] : ''); }
  }
  return s;
}
const apoc = (s) => s.replace(/uno$/, 'ún'); // "veintiuno mil" → "veintiún mil"

export function numeroALetras(num) {
  const entero = Math.floor(Math.abs(num));
  if (entero === 0) return 'cero';
  let p = '';
  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const cientos = entero % 1000;
  if (millones) p += (millones === 1 ? 'un millón' : apoc(centenas(millones)) + ' millones') + ' ';
  if (miles) p += (miles === 1 ? 'mil' : apoc(centenas(miles)) + ' mil') + ' ';
  if (cientos) p += centenas(cientos);
  return p.trim();
}

/** "Dos mil pesos 00/100 MN" */
export function cantidadEnLetra(num) {
  const n = Number(num) || 0;
  const entero = Math.floor(n);
  const cent = Math.round((n - entero) * 100);
  const letras = numeroALetras(entero);
  return letras.charAt(0).toUpperCase() + letras.slice(1) + ' pesos ' + String(cent).padStart(2, '0') + '/100 MN';
}

// ---------- Datos del comprobante según tipo ----------
function datos(tipo, item) {
  if (tipo === 'gasto') {
    return {
      titulo: 'Comprobante de Egreso',
      folio: 'G-' + (item.folio ?? '—'),
      fecha: item.fecha, lote: item.lote || '—',
      concepto: item.categoria || item.concepto || '—',
      detalle: item.concepto || '',
      pago: item.metodo || '—',
      nombre: item.beneficiario || '—',
      monto: item.monto, etapa: item.etapa || '',
      autorizo: item.recibe || '—',
    };
  }
  // SKVO (maquinaria): mismo formato. Ingreso = recibo de pago; Gasto = egreso.
  if (tipo === 'skvo-gasto') {
    return {
      titulo: 'Comprobante SKVO',
      folio: 'SKG-' + (item.folio ?? '—'),
      fecha: item.fecha, lote: item.lote || '—',
      concepto: item.categoria || '—',
      detalle: item.concepto || '',
      pago: item.metodo || '—',
      nombre: item.entrego || '—',
      monto: item.monto, etapa: item.etapa || '',
      autorizo: item.entrego || '—',
    };
  }
  if (tipo === 'skvo-ingreso') {
    return {
      titulo: 'Recibo SKVO',
      folio: 'SKI-' + (item.folio ?? '—'),
      fecha: item.fecha, lote: item.lote || '—',
      concepto: item.categoria || '—',
      detalle: '',
      pago: item.metodo || '—',
      nombre: item.cliente || '—',
      monto: item.monto, etapa: item.etapa || '',
      autorizo: item.captura || '—',
    };
  }
  return {
    titulo: 'Recibo de Pago',
    folio: item.recibo || ('R-' + (item.folio ?? '—')),
    fecha: item.fecha, lote: item.lote || '—',
    concepto: item.categoria || '—',
    detalle: item.observaciones || '',
    pago: item.metodo || '—',
    nombre: item.cliente || '—',
    monto: item.monto, etapa: item.etapa || '',
    autorizo: item.vendedor || '—',
  };
}

function mitad(d, rol) {
  const esTalon = rol === 'talon';
  const fila = (l, v) => `<div class="fld"><span class="lbl">${esc(l)}</span><span class="val">${esc(v)}</span></div>`;
  return `
    <div class="half ${esTalon ? 'talon' : 'copia'}">
      <div class="content">
        <div class="tituloRow"><span class="titulo">${esc(d.titulo)}</span><span class="folio">No. ${esc(d.folio)}</span></div>
        <div class="grid">
          ${fila('Fecha', prettyDate(d.fecha))}
          ${fila('Lote', d.lote)}
          ${fila('Concepto', d.concepto)}
          ${fila('Pago', d.pago)}
        </div>
        <div class="nombre">${fila('Nombre', d.nombre)}</div>
        <div class="montoRow">
          <span class="montoLbl">Cantidad</span>
          <span class="monto">${money(d.monto)}</span>
        </div>
        <div class="letra">${esc(cantidadEnLetra(d.monto))}</div>
        <div class="firmaRow">
          <span class="firma">${esTalon ? 'Recibí Comprobante' : 'Firma de Recibido'}</span>
        </div>
      </div>
    </div>`;
}

export function comprobanteHTML(tipo, item, opts = {}) {
  const d = datos(tipo, item);
  return `<!DOCTYPE html><html lang="es-MX"><head><meta charset="UTF-8"><title>Recibo ${esc(d.folio)}</title>
  <style>
    /* Impresión en hoja CARTA, orientación horizontal (landscape). */
    @page { size: letter landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* El recibo se centra verticalmente en la hoja y se ajusta al lado derecho. */
    .page { width: 100%; min-height: 100%; display: flex; align-items: center; justify-content: flex-end; padding-right: 0.6cm; }
    .sheet { width: 21cm; height: 7.5cm; display: flex; }
    .half { position: relative; height: 7.5cm; padding: 0 0.45cm; overflow: hidden; }
    .talon { width: 8.3cm; }    /* talón (lo conserva la administración) */
    .copia { width: 12.7cm; }   /* 8.3 + 12.7 = 21 cm */
    /* padding-top baja el bloque de texto ~13 mm respecto al ajuste anterior. */
    .content { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; padding-top: 2.6cm; }
    .tituloRow { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 2pt; }
    .titulo { font-size: 9.5pt; font-weight: 700; }
    .folio { font-size: 10pt; font-weight: 700; color: #000; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1pt 10pt; margin-top: 4pt; }
    .fld { display: flex; gap: 4pt; font-size: 8.5pt; align-items: baseline; }
    .lbl { color: #000; min-width: 1.5cm; }
    .val { font-weight: 600; flex: 1; }
    .nombre { margin-top: 2pt; }
    .nombre .lbl { min-width: 1.5cm; }
    .montoRow { display: flex; align-items: baseline; justify-content: space-between; margin-top: 5pt; }
    .montoLbl { font-size: 8.5pt; color: #000; }
    .monto { font-size: 15pt; font-weight: 800; }
    .letra { font-size: 8pt; font-style: italic; color: #000; margin-top: 1pt; text-transform: capitalize; }
    /* Firma anclada a 1 cm del borde inferior; el espacio con la cantidad en letra queda comprimido. */
    .firmaRow { position: absolute; left: 0; right: 0; bottom: 1cm; display: flex; justify-content: flex-end; align-items: flex-end; }
    /* El lado derecho (copia) sube su texto 5 mm respecto al talón. */
    .copia .content { padding-top: 2.1cm; }
    .auto { font-size: 8pt; }
    .firma { font-size: 7.5pt; text-align: center; border-top: 1px solid #000; padding-top: 2pt; width: 4.2cm; color: #000; }
    @media screen { body { background: #e5e7eb; } .page { padding: 16px; } .sheet { background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.2); } }
    @media print { html, body { width: 27.94cm; height: 21.59cm; } .page { height: 21.59cm; padding-right: 0.6cm; } }
  </style></head>
  <body>
    <div class="page"><div class="sheet">${mitad(d, 'talon')}${mitad(d, 'copia')}</div></div>
    ${opts.preview ? '' : `<script>
      function go(){ try { window.focus(); window.print(); } catch(e){} }
      setTimeout(go, 200);
    <\/script>`}
  </body></html>`;
}

/**
 * Abre una ventana con el comprobante y lanza la impresión.
 * @param {'ingreso'|'gasto'|'skvo-ingreso'|'skvo-gasto'} tipo
 * @param {object} item registro (ingreso, gasto o registro SKVO)
 */
export function imprimirComprobante(tipo, item) {
  const w = window.open('', '_blank', 'width=900,height=420');
  if (!w) { alert('Permite las ventanas emergentes para imprimir el recibo.'); return; }
  w.document.open();
  w.document.write(comprobanteHTML(tipo, item));
  w.document.close();
}
