import ExcelJS from "exceljs";
import JSZip from "jszip";

/**
 * Excel profesional del reporte de llamadas de IA: hojas con formato, fórmulas vivas (porcentajes y totales se
 * recalculan si se cambia un número), barras de datos y gráficos NATIVOS de Excel (editables), más el detalle
 * llamada por llamada con filtros. Se arma con ExcelJS y los gráficos se inyectan después en el archivo (ExcelJS no
 * los soporta).
 */

// Paleta de la plataforma
const INDIGO = "FF4F46E5";
const INDIGO_OSCURO = "FF312E81";
const INDIGO_CLARO = "FFEEF2FF";
const GRIS_TEXTO = "FF475569";
const GRIS_LINEA = "FFE2E8F0";
const GRIS_FILA = "FFF8FAFC";
const BLANCO = "FFFFFFFF";

const COLOR_CONVERSACION = "6366F1";
const COLOR_NO_CONTESTADAS = "FBBF24";
const COLOR_TRANSFERIDAS = "10B981";
const COLOR_TOTAL = "94A3B8";

export interface DatosExcel {
  empresa: string;
  zona: string;
  generado: string;
  periodo: { desde: string; hasta: string };
  tipoEtiqueta: string;
  campanaNombre: string | null;
  resumen: Record<string, number>;
  porDia: { dia: string; total: number; con_conversacion: number; no_contestadas: number; transferidas: number }[];
  porTipo: { tipo: string; llamadas: number; con_conversacion: number; no_contestadas: number; transferidas: number; con_grabacion: number }[];
  porCampana: { campana_nombre: string; llamadas: number; con_conversacion: number; no_contestadas: number; buzon: number; transferidas: number }[];
  porRegla: { regla: string; llamadas: number; transferidas: number }[];
  porDepartamento: { departamento: string; llamadas: number; transferidas: number }[];
  motivos: { motivo: string; n: number }[];
  solicitudes: { tipo: string; n: number }[];
  filas: Record<string, string | number>[];
}

const NOMBRE_TIPO: Record<string, string> = {
  entrante: "Entrantes",
  campana: "Campañas",
  api: "API",
  flujo: "Flujos automáticos",
  click_to_call: "Click-to-call (asesor)",
  otro: "Otras",
};
const NOMBRE_SOLICITUD: Record<string, string> = { cotizacion: "Cotización", reclamo: "Reclamo", cita: "Cita", otro: "Otro" };

function formatoFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// ───────────────────────── utilidades de estilo ─────────────────────────

type Hoja = ExcelJS.Worksheet;

const borde: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: GRIS_LINEA } },
  bottom: { style: "thin", color: { argb: GRIS_LINEA } },
  left: { style: "thin", color: { argb: GRIS_LINEA } },
  right: { style: "thin", color: { argb: GRIS_LINEA } },
};

function titulo(hoja: Hoja, rango: string, texto: string, tamano = 18) {
  hoja.mergeCells(rango);
  const celda = hoja.getCell(rango.split(":")[0]);
  celda.value = texto;
  celda.font = { name: "Calibri", size: tamano, bold: true, color: { argb: INDIGO_OSCURO } };
  celda.alignment = { vertical: "middle" };
}

function subtitulo(hoja: Hoja, rango: string, texto: string) {
  hoja.mergeCells(rango);
  const celda = hoja.getCell(rango.split(":")[0]);
  celda.value = texto;
  celda.font = { name: "Calibri", size: 10, color: { argb: GRIS_TEXTO } };
  celda.alignment = { vertical: "middle", wrapText: true };
}

/** Franja de sección (texto en mayúsculas sobre fondo índigo) que ocupa de la columna `desde` a `hasta` de la fila. */
function seccion(hoja: Hoja, fila: number, desde: number, hasta: number, texto: string) {
  hoja.mergeCells(fila, desde, fila, hasta);
  const celda = hoja.getCell(fila, desde);
  celda.value = texto.toUpperCase();
  celda.font = { name: "Calibri", size: 10, bold: true, color: { argb: BLANCO } };
  for (let c = desde; c <= hasta; c++) hoja.getCell(fila, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
  celda.alignment = { vertical: "middle", indent: 1 };
  hoja.getRow(fila).height = 20;
}

function encabezados(hoja: Hoja, fila: number, columnaInicial: number, textos: string[]) {
  textos.forEach((t, i) => {
    const c = hoja.getCell(fila, columnaInicial + i);
    c.value = t;
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: INDIGO_OSCURO } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO_CLARO } };
    c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
    c.border = borde;
  });
  hoja.getRow(fila).height = 26;
}

function celdaDato(c: ExcelJS.Cell, valor: ExcelJS.CellValue, opciones: { formato?: string; alinear?: "left" | "center" | "right"; negrita?: boolean; fila?: number } = {}) {
  c.value = valor;
  c.font = { name: "Calibri", size: 10, bold: opciones.negrita, color: { argb: "FF0F172A" } };
  c.border = borde;
  c.alignment = { vertical: "middle", horizontal: opciones.alinear ?? "left", indent: opciones.alinear ? 0 : 1 };
  if (opciones.formato) c.numFmt = opciones.formato;
  if (opciones.fila !== undefined && opciones.fila % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_FILA } };
}

function barraDeDatos(hoja: Hoja, ref: string, argb: string) {
  hoja.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "dataBar",
        priority: 1,
        gradient: false,
        minLength: 0,
        maxLength: 100,
        cfvo: [
          { type: "num", value: 0 },
          { type: "num", value: 1 },
        ],
        color: { argb },
      } as unknown as ExcelJS.ConditionalFormattingRule,
    ],
  });
}

function configurarImpresion(hoja: Hoja, titulosFila?: string) {
  hoja.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    ...(titulosFila ? { printTitlesRow: titulosFila } : {}),
  };
  hoja.headerFooter = {
    oddFooter: "&L&8Reporte de llamadas de IA&C&8&D&R&8Página &P de &N",
  };
}

// ───────────────────────── gráficos nativos (XML) ─────────────────────────

interface SerieGrafico {
  nombre: string;
  refNombre: string;
  refCategorias: string;
  categorias: string[];
  refValores: string;
  valores: number[];
  color: string;
}

interface GraficoDef {
  hoja: string; // nombre de la hoja donde se coloca
  titulo: string;
  tipo: "barras" | "barras_horizontales" | "dona";
  series: SerieGrafico[];
  /** Solo dona: color de cada porción, en el orden de las categorías. */
  coloresPorcion?: string[];
  /** celdas (0-based) de la esquina superior izquierda y la inferior derecha */
  desde: { col: number; fila: number };
  hasta: { col: number; fila: number };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function puntosTexto(valores: string[]): string {
  return `<c:strCache><c:ptCount val="${valores.length}"/>${valores.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("")}</c:strCache>`;
}
function puntosNumero(valores: number[]): string {
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${valores.length}"/>${valores.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache>`;
}

function xmlSerie(s: SerieGrafico, i: number, tipo: GraficoDef["tipo"]): string {
  const relleno = `<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr>`;
  const etiquetas =
    tipo === "dona"
      ? `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>`
      : `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const tx = `<c:tx><c:strRef><c:f>${esc(s.refNombre)}</c:f>${puntosTexto([s.nombre])}</c:strRef></c:tx>`;
  const cat = `<c:cat><c:strRef><c:f>${esc(s.refCategorias)}</c:f>${puntosTexto(s.categorias)}</c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>${esc(s.refValores)}</c:f>${puntosNumero(s.valores)}</c:numRef></c:val>`;

  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${relleno}<c:invertIfNegative val="0"/>${etiquetas}${cat}${val}</c:ser>`;
}

function xmlGrafico(def: GraficoDef): string {
  const cabecera = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"/></a:pPr><a:r><a:rPr lang="es-ES" sz="1300" b="1"><a:solidFill><a:srgbClr val="312E81"/></a:solidFill></a:rPr><a:t>${esc(def.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;
  const pie = `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
  const leyenda = `<c:legend><c:legendPos val="b"/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr></c:legend>`;

  if (def.tipo === "dona") {
    // Una sola serie con una porción por categoría (cada una con su color)
    const base = def.series[0];
    const porciones = base.valores
      .map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${def.coloresPorcion?.[i] ?? base.color}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`)
      .join("");
    const serie = `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>${esc(base.refNombre)}</c:f>${puntosTexto([base.nombre])}</c:strRef></c:tx>${porciones}<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls><c:cat><c:strRef><c:f>${esc(base.refCategorias)}</c:f>${puntosTexto(base.categorias)}</c:strRef></c:cat><c:val><c:numRef><c:f>${esc(base.refValores)}</c:f>${puntosNumero(base.valores)}</c:numRef></c:val></c:ser>`;
    return `${cabecera}<c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/>${serie}<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart></c:plotArea>${leyenda}${pie}`;
  }

  const horizontal = def.tipo === "barras_horizontales";
  const series = def.series.map((s, i) => xmlSerie(s, i, def.tipo)).join("");
  const ejeCat = `<c:catAx><c:axId val="111111"/><c:scaling><c:orientation val="${horizontal ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr><c:crossAx val="222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const ejeVal = `<c:valAx><c:axId val="222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "b" : "l"}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr><c:crossAx val="111111"/><c:crosses val="${horizontal ? "max" : "autoZero"}"/><c:crossBetween val="between"/></c:valAx>`;
  return `${cabecera}<c:plotArea><c:layout/><c:barChart><c:barDir val="${horizontal ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="70"/><c:axId val="111111"/><c:axId val="222222"/></c:barChart>${ejeCat}${ejeVal}</c:plotArea>${leyenda}${pie}`;
}

function xmlDibujo(graficos: { rId: string; def: GraficoDef; id: number }[]): string {
  const anclas = graficos
    .map(
      ({ rId, def, id }) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${def.desde.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${def.desde.fila}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${def.hasta.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${def.hasta.fila}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id + 1}" name="Gráfico ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anclas}</xdr:wsDr>`;
}

/** Inyecta los gráficos en el .xlsx ya generado (dibujo + gráfico + relaciones + tipos de contenido). */
async function inyectarGraficos(buffer: Buffer, graficos: GraficoDef[], nombresHojas: string[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  let contentTypes = await zip.file("[Content_Types].xml")!.async("string");
  const nuevosTipos: string[] = [];

  // Agrupa los gráficos por hoja: cada hoja con gráficos recibe UN dibujo con todos sus gráficos.
  const porHoja = new Map<string, GraficoDef[]>();
  for (const g of graficos) porHoja.set(g.hoja, [...(porHoja.get(g.hoja) ?? []), g]);

  let numDibujo = 0;
  let numGrafico = 0;
  for (const [hoja, defs] of porHoja) {
    const indiceHoja = nombresHojas.indexOf(hoja) + 1;
    if (indiceHoja <= 0) continue;
    numDibujo++;
    const rutaHoja = `xl/worksheets/sheet${indiceHoja}.xml`;
    const rutaRelsHoja = `xl/worksheets/_rels/sheet${indiceHoja}.xml.rels`;

    const items: { rId: string; def: GraficoDef; id: number }[] = [];
    const relsDibujo: string[] = [];
    defs.forEach((def, k) => {
      numGrafico++;
      const rId = `rId${k + 1}`;
      items.push({ rId, def, id: k + 1 });
      zip.file(`xl/charts/chart${numGrafico}.xml`, xmlGrafico(def));
      relsDibujo.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${numGrafico}.xml"/>`);
      nuevosTipos.push(`<Override PartName="/xl/charts/chart${numGrafico}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
    });
    zip.file(`xl/drawings/drawing${numDibujo}.xml`, xmlDibujo(items));
    zip.file(
      `xl/drawings/_rels/drawing${numDibujo}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsDibujo.join("")}</Relationships>`
    );
    nuevosTipos.push(`<Override PartName="/xl/drawings/drawing${numDibujo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);

    // Relación hoja → dibujo
    let rels = zip.file(rutaRelsHoja) ? await zip.file(rutaRelsHoja)!.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const idRelDibujo = `rIdGraf${numDibujo}`;
    rels = rels.replace("</Relationships>", `<Relationship Id="${idRelDibujo}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${numDibujo}.xml"/></Relationships>`);
    zip.file(rutaRelsHoja, rels);

    // <drawing> dentro de la hoja, en su lugar correcto (después de pageSetup/headerFooter, antes de tableParts/extLst)
    let xmlHoja = await zip.file(rutaHoja)!.async("string");
    if (!/xmlns:r=/.test(xmlHoja.slice(0, 600))) {
      xmlHoja = xmlHoja.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    }
    const etiquetaDibujo = `<drawing r:id="${idRelDibujo}"/>`;
    // Va al nivel de la hoja, justo después de headerFooter / pageSetup / pageMargins (ese es el orden que exige
    // Excel). OJO: no se puede buscar "<extLst": las reglas de barras de datos traen su propio extLst por dentro.
    const anclas = [/<\/headerFooter>/, /<headerFooter[^>]*\/>/, /<pageSetup[^>]*\/>/, /<pageMargins[^>]*\/>/];
    let insertado = false;
    for (const patron of anclas) {
      const m = patron.exec(xmlHoja);
      if (m) {
        const fin = m.index + m[0].length;
        xmlHoja = xmlHoja.slice(0, fin) + etiquetaDibujo + xmlHoja.slice(fin);
        insertado = true;
        break;
      }
    }
    if (!insertado) {
      // Sin ninguno de esos elementos: antes de un extLst de nivel hoja (el último) o del cierre
      const iExt = xmlHoja.lastIndexOf("<extLst");
      const iFin = xmlHoja.lastIndexOf("</worksheet>");
      const posicion = iExt > xmlHoja.lastIndexOf("</sheetData>") ? iExt : iFin;
      xmlHoja = xmlHoja.slice(0, posicion) + etiquetaDibujo + xmlHoja.slice(posicion);
    }
    zip.file(rutaHoja, xmlHoja);
  }

  contentTypes = contentTypes.replace("</Types>", `${nuevosTipos.join("")}</Types>`);
  zip.file("[Content_Types].xml", contentTypes);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ───────────────────────── el libro ─────────────────────────

export async function construirExcel(d: DatosExcel): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Plataforma de Voz IA";
  libro.created = new Date();
  libro.title = "Reporte de llamadas de IA";
  libro.calcProperties.fullCalcOnLoad = true; // recalcula las fórmulas al abrir

  const graficos: GraficoDef[] = [];
  const nombresHojas: string[] = [];
  const nuevaHoja = (nombre: string, color = INDIGO) => {
    const h = libro.addWorksheet(nombre, { properties: { tabColor: { argb: color } }, views: [{ showGridLines: false }] });
    nombresHojas.push(nombre);
    return h;
  };

  const r = d.resumen;
  const subtituloPeriodo =
    `${d.periodo.desde === d.periodo.hasta ? formatoFecha(d.periodo.desde) : `${formatoFecha(d.periodo.desde)} al ${formatoFecha(d.periodo.hasta)}`}` +
    ` · ${d.tipoEtiqueta}` +
    (d.campanaNombre ? ` · Campaña: ${d.campanaNombre}` : "");

  // ════════ Hoja 1: Resumen ════════
  const hr = nuevaHoja("Resumen");
  hr.columns = [{ width: 2 }, { width: 46 }, { width: 14 }, { width: 30 }, { width: 3 }, { width: 38 }, { width: 14 }, { width: 22 }, { width: 3 }];
  hr.getRow(2).height = 30;
  titulo(hr, "B2:H2", "Reporte de llamadas de IA", 22);
  subtitulo(hr, "B3:H3", `${d.empresa} — ${subtituloPeriodo}`);
  subtitulo(hr, "B4:H4", `Generado el ${d.generado} · Zona horaria: ${d.zona}`);

  // Indicadores clave
  seccion(hr, 6, 2, 4, "Indicadores clave");
  encabezados(hr, 7, 2, ["Indicador", "Valor", "Porcentaje / detalle"]);
  const res = (num: number, den: number) => (den > 0 ? num / den : 0);
  // [etiqueta, valor, fórmula del %, resultado del %, nota]
  const filasKpi: [string, number, string | null, number, string?][] = [
    ["Llamadas de IA", r.total, null, 0, `${r.entrantes} entrantes · ${r.salientes} salientes`],
    ["Con conversación", r.con_conversacion, "IFERROR(C9/C8,0)", res(r.con_conversacion, r.total)],
    ["No contestadas", r.no_contestadas, "IFERROR(C10/C8,0)", res(r.no_contestadas, r.total)],
    ["Transferidas a un asesor (% de las conversaciones)", r.transferidas, "IFERROR(C11/C9,0)", res(r.transferidas, r.con_conversacion)],
    ["Atendidas por un asesor", r.atendidas_por_asesor, "IFERROR(C12/C8,0)", res(r.atendidas_por_asesor, r.total)],
    ["Con grabación", r.con_grabacion, "IFERROR(C13/C8,0)", res(r.con_grabacion, r.total)],
  ];
  filasKpi.forEach(([etiqueta, valor, formula, resultado, nota], i) => {
    const fila = 8 + i;
    celdaDato(hr.getCell(fila, 2), etiqueta, { fila: i });
    celdaDato(hr.getCell(fila, 3), valor, { alinear: "center", negrita: true, formato: "#,##0", fila: i });
    if (formula) celdaDato(hr.getCell(fila, 4), { formula, result: resultado }, { alinear: "center", formato: "0%", fila: i });
    else celdaDato(hr.getCell(fila, 4), nota ?? "", { alinear: "center", fila: i });
  });
  celdaDato(hr.getCell(14, 2), "Duración promedio de una conversación", { fila: 6 });
  celdaDato(hr.getCell(14, 3), r.duracion_promedio_segundos / 86400, { alinear: "center", negrita: true, formato: "[h]:mm:ss", fila: 6 });
  celdaDato(hr.getCell(14, 4), "horas:min:seg", { alinear: "center", fila: 6 });
  celdaDato(hr.getCell(15, 2), "Tiempo total en llamadas", { fila: 7 });
  celdaDato(hr.getCell(15, 3), r.segundos_totales / 86400, { alinear: "center", negrita: true, formato: "[h]:mm:ss", fila: 7 });
  celdaDato(hr.getCell(15, 4), "horas:min:seg", { alinear: "center", fila: 7 });
  barraDeDatos(hr, "D9:D13", "FFC7D2FE");

  // Cómo terminaron + no contestadas (columna derecha)
  seccion(hr, 6, 6, 8, "Cómo terminaron las llamadas");
  encabezados(hr, 7, 6, ["Resultado", "Llamadas", "Porcentaje"]);
  const sinCalificar = Math.max(0, r.total - r.no_contestadas - r.con_conversacion);
  const transferidasConv = Math.min(r.transferidas, r.con_conversacion);
  // Las cuatro partes suman el total de llamadas (por eso "Con conversación" aquí NO incluye las transferidas).
  const resultados: [string, number][] = [
    ["Conversación (sin transferir)", r.con_conversacion - transferidasConv],
    ["Transferidas a un asesor", transferidasConv],
    ["No contestadas", r.no_contestadas],
    ["Sin conversación / en curso", sinCalificar],
  ];
  resultados.forEach(([etiqueta, valor], i) => {
    const fila = 8 + i;
    celdaDato(hr.getCell(fila, 6), etiqueta, { fila: i });
    celdaDato(hr.getCell(fila, 7), valor, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hr.getCell(fila, 8), { formula: `IFERROR(G${fila}/SUM($G$8:$G$11),0)`, result: res(valor, resultados.reduce((a, x) => a + x[1], 0)) }, { alinear: "center", formato: "0%", fila: i });
  });
  barraDeDatos(hr, "H8:H11", "FFA7F3D0");

  seccion(hr, 13, 6, 8, "Las que no se contestaron");
  encabezados(hr, 14, 6, ["Motivo", "Llamadas", "% de las no contestadas"]);
  const noContestadas: [string, number][] = [
    ["Buzón de voz", r.buzon],
    ["Número inexistente / fuera de servicio", r.numero_inexistente],
    ["No contestó / ocupado / falló", r.otras_no_contestadas],
    ["Cerradas por un asesor sin contacto", r.cerradas_sin_contacto],
  ];
  noContestadas.forEach(([etiqueta, valor], i) => {
    const fila = 15 + i;
    celdaDato(hr.getCell(fila, 6), etiqueta, { fila: i });
    celdaDato(hr.getCell(fila, 7), valor, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hr.getCell(fila, 8), { formula: `IFERROR(G${fila}/SUM($G$15:$G$18),0)`, result: res(valor, noContestadas.reduce((a, x) => a + x[1], 0)) }, { alinear: "center", formato: "0%", fila: i });
  });
  barraDeDatos(hr, "H15:H18", "FFFDE68A");

  // Ánimo del cliente
  seccion(hr, 17, 2, 4, "Ánimo del cliente al terminar");
  encabezados(hr, 18, 2, ["Valoración", "Llamadas", "Porcentaje"]);
  const animo: [string, number][] = [
    ["Contentos", r.sat_positiva],
    ["Neutrales", r.sat_neutral],
    ["Molestos", r.sat_negativa],
  ];
  const evaluadas = animo.reduce((a, x) => a + x[1], 0);
  animo.forEach(([etiqueta, valor], i) => {
    const fila = 19 + i;
    celdaDato(hr.getCell(fila, 2), etiqueta, { fila: i });
    celdaDato(hr.getCell(fila, 3), valor, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hr.getCell(fila, 4), { formula: `IFERROR(C${fila}/SUM($C$19:$C$21),0)`, result: res(valor, evaluadas) }, { alinear: "center", formato: "0%", fila: i });
  });
  barraDeDatos(hr, "D19:D21", "FFC7D2FE");
  subtitulo(hr, "B23:H23", "“Llamada de IA” = entrantes, campañas, llamadas pedidas por API y flujos de trabajo. Las llamadas que un asesor marca a mano desde el panel no se cuentan.");
  hr.getRow(23).height = 28;
  configurarImpresion(hr);
  hr.pageSetup.fitToHeight = 1;

  graficos.push({
    hoja: "Resumen",
    titulo: "Cómo terminaron las llamadas",
    tipo: "dona",
    desde: { col: 1, fila: 24 },
    hasta: { col: 4, fila: 42 },
    coloresPorcion: [COLOR_CONVERSACION, COLOR_TRANSFERIDAS, COLOR_NO_CONTESTADAS, COLOR_TOTAL],
    series: [
      {
        nombre: "Llamadas",
        refNombre: "Resumen!$G$7",
        refCategorias: "Resumen!$F$8:$F$11",
        categorias: resultados.map((x) => x[0]),
        refValores: "Resumen!$G$8:$G$11",
        valores: resultados.map((x) => x[1]),
        color: COLOR_CONVERSACION,
      },
    ],
  });

  // ════════ Hoja 2: Por día ════════
  const hd = nuevaHoja("Por día");
  hd.columns = [{ width: 14 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 14 }, { width: 18 }, { width: 3 }];
  titulo(hd, "A1:F1", "Llamadas de IA por día", 16);
  subtitulo(hd, "A2:F2", subtituloPeriodo);
  encabezados(hd, 3, 1, ["Fecha", "Total", "Conversaciones", "No contestadas", "Transferidas", "% con conversación"]);
  d.porDia.forEach((x, i) => {
    const fila = 4 + i;
    celdaDato(hd.getCell(fila, 1), formatoFecha(x.dia), { alinear: "center", fila: i });
    celdaDato(hd.getCell(fila, 2), x.total, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hd.getCell(fila, 3), x.con_conversacion, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hd.getCell(fila, 4), x.no_contestadas, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hd.getCell(fila, 5), x.transferidas, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hd.getCell(fila, 6), { formula: `IFERROR(C${fila}/B${fila},0)`, result: res(x.con_conversacion, x.total) }, { alinear: "center", formato: "0%", fila: i });
  });
  const ultimaDia = 3 + d.porDia.length;
  const filaTotalDia = ultimaDia + 1;
  if (d.porDia.length > 0) {
    ["B", "C", "D", "E"].forEach((col, k) => {
      const suma = d.porDia.reduce((a, x) => a + [x.total, x.con_conversacion, x.no_contestadas, x.transferidas][k], 0);
      const c = hd.getCell(`${col}${filaTotalDia}`);
      celdaDato(c, { formula: `SUM(${col}4:${col}${ultimaDia})`, result: suma }, { alinear: "center", negrita: true, formato: "#,##0" });
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO_CLARO } };
    });
    const ct = hd.getCell(`A${filaTotalDia}`);
    celdaDato(ct, "TOTAL", { alinear: "center", negrita: true });
    ct.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO_CLARO } };
    const cp = hd.getCell(`F${filaTotalDia}`);
    celdaDato(cp, { formula: `IFERROR(C${filaTotalDia}/B${filaTotalDia},0)`, result: res(r.con_conversacion, r.total) }, { alinear: "center", negrita: true, formato: "0%" });
    cp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO_CLARO } };
    barraDeDatos(hd, `F4:F${ultimaDia}`, "FFC7D2FE");

    graficos.push({
      hoja: "Por día",
      titulo: "Llamadas de IA por día",
      tipo: "barras",
      desde: { col: 7, fila: 2 },
      hasta: { col: 17, fila: 22 },
      series: [
        { nombre: "Conversaciones", refNombre: "'Por día'!$C$3", refCategorias: `'Por día'!$A$4:$A$${ultimaDia}`, categorias: d.porDia.map((x) => formatoFecha(x.dia)), refValores: `'Por día'!$C$4:$C$${ultimaDia}`, valores: d.porDia.map((x) => x.con_conversacion), color: COLOR_CONVERSACION },
        { nombre: "No contestadas", refNombre: "'Por día'!$D$3", refCategorias: `'Por día'!$A$4:$A$${ultimaDia}`, categorias: d.porDia.map((x) => formatoFecha(x.dia)), refValores: `'Por día'!$D$4:$D$${ultimaDia}`, valores: d.porDia.map((x) => x.no_contestadas), color: COLOR_NO_CONTESTADAS },
        { nombre: "Transferidas", refNombre: "'Por día'!$E$3", refCategorias: `'Por día'!$A$4:$A$${ultimaDia}`, categorias: d.porDia.map((x) => formatoFecha(x.dia)), refValores: `'Por día'!$E$4:$E$${ultimaDia}`, valores: d.porDia.map((x) => x.transferidas), color: COLOR_TRANSFERIDAS },
      ],
    });
  } else {
    subtitulo(hd, "A4:F4", "No hay llamadas de IA en este periodo.");
  }
  hd.views = [{ showGridLines: false, state: "frozen", ySplit: 3 }];
  configurarImpresion(hd);

  // ════════ Hoja 3: Por tipo ════════
  const ht = nuevaHoja("Por tipo");
  ht.columns = [{ width: 26 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 3 }];
  titulo(ht, "A1:G1", "Llamadas por tipo", 16);
  subtitulo(ht, "A2:G2", `${subtituloPeriodo} — Click-to-call son llamadas de un asesor pedidas desde el CRM (no son de IA).`);
  encabezados(ht, 3, 1, ["Tipo de llamada", "Llamadas", "Conversaciones", "No contestadas", "Transferidas", "Con grabación", "% con conversación"]);
  const tiposOrden = ["entrante", "campana", "api", "flujo", "click_to_call"];
  const filasTipo = tiposOrden.map((t) => d.porTipo.find((x) => x.tipo === t) ?? { tipo: t, llamadas: 0, con_conversacion: 0, no_contestadas: 0, transferidas: 0, con_grabacion: 0 });
  filasTipo.forEach((x, i) => {
    const fila = 4 + i;
    celdaDato(ht.getCell(fila, 1), NOMBRE_TIPO[x.tipo] ?? x.tipo, { fila: i });
    [x.llamadas, x.con_conversacion, x.no_contestadas, x.transferidas, x.con_grabacion].forEach((v, k) => celdaDato(ht.getCell(fila, 2 + k), v, { alinear: "center", formato: "#,##0", fila: i }));
    celdaDato(ht.getCell(fila, 7), { formula: `IFERROR(C${fila}/B${fila},0)`, result: res(x.con_conversacion, x.llamadas) }, { alinear: "center", formato: "0%", fila: i });
  });
  barraDeDatos(ht, "G4:G8", "FFC7D2FE");
  graficos.push({
    hoja: "Por tipo",
    titulo: "Llamadas por tipo",
    tipo: "barras_horizontales",
    desde: { col: 0, fila: 9 },
    hasta: { col: 7, fila: 28 },
    series: [
      { nombre: "Conversaciones", refNombre: "'Por tipo'!$C$3", refCategorias: "'Por tipo'!$A$4:$A$8", categorias: filasTipo.map((x) => NOMBRE_TIPO[x.tipo] ?? x.tipo), refValores: "'Por tipo'!$C$4:$C$8", valores: filasTipo.map((x) => x.con_conversacion), color: COLOR_CONVERSACION },
      { nombre: "No contestadas", refNombre: "'Por tipo'!$D$3", refCategorias: "'Por tipo'!$A$4:$A$8", categorias: filasTipo.map((x) => NOMBRE_TIPO[x.tipo] ?? x.tipo), refValores: "'Por tipo'!$D$4:$D$8", valores: filasTipo.map((x) => x.no_contestadas), color: COLOR_NO_CONTESTADAS },
    ],
  });
  ht.views = [{ showGridLines: false, state: "frozen", ySplit: 3 }];
  configurarImpresion(ht);

  // ════════ Hoja 4: Campañas ════════
  const hc = nuevaHoja("Campañas");
  hc.columns = [{ width: 34 }, { width: 11 }, { width: 14 }, { width: 15 }, { width: 11 }, { width: 14 }, { width: 18 }, { width: 18 }];
  titulo(hc, "A1:H1", "Resultados por campaña", 16);
  subtitulo(hc, "A2:H2", subtituloPeriodo);
  encabezados(hc, 3, 1, ["Campaña", "Llamadas", "Conversaron", "No contestaron", "Buzón", "Transferidas", "% con conversación", "% no contestaron"]);
  if (d.porCampana.length === 0) {
    subtitulo(hc, "A4:H4", "No hubo llamadas de campañas en este periodo.");
  } else {
    d.porCampana.forEach((x, i) => {
      const fila = 4 + i;
      celdaDato(hc.getCell(fila, 1), x.campana_nombre, { fila: i });
      [x.llamadas, x.con_conversacion, x.no_contestadas, x.buzon, x.transferidas].forEach((v, k) => celdaDato(hc.getCell(fila, 2 + k), v, { alinear: "center", formato: "#,##0", fila: i }));
      celdaDato(hc.getCell(fila, 7), { formula: `IFERROR(C${fila}/B${fila},0)`, result: res(x.con_conversacion, x.llamadas) }, { alinear: "center", formato: "0%", fila: i });
      celdaDato(hc.getCell(fila, 8), { formula: `IFERROR(D${fila}/B${fila},0)`, result: res(x.no_contestadas, x.llamadas) }, { alinear: "center", formato: "0%", fila: i });
    });
    const ult = 3 + d.porCampana.length;
    barraDeDatos(hc, `G4:G${ult}`, "FFC7D2FE");
    barraDeDatos(hc, `H4:H${ult}`, "FFFDE68A");
    const ft = ult + 1;
    celdaDato(hc.getCell(ft, 1), "TOTAL", { negrita: true });
    ["B", "C", "D", "E", "F"].forEach((col, k) => {
      const suma = d.porCampana.reduce((a, x) => a + [x.llamadas, x.con_conversacion, x.no_contestadas, x.buzon, x.transferidas][k], 0);
      celdaDato(hc.getCell(`${col}${ft}`), { formula: `SUM(${col}4:${col}${ult})`, result: suma }, { alinear: "center", negrita: true, formato: "#,##0" });
    });
    for (let c = 1; c <= 8; c++) hc.getCell(ft, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO_CLARO } };
  }
  hc.views = [{ showGridLines: false, state: "frozen", ySplit: 3 }];
  configurarImpresion(hc);

  // ════════ Hoja 5: API y departamentos ════════
  const ha = nuevaHoja("API y departamentos");
  ha.columns = [{ width: 40 }, { width: 12 }, { width: 14 }, { width: 4 }, { width: 34 }, { width: 12 }, { width: 14 }];
  titulo(ha, "A1:G1", "Llamadas por API y departamentos", 16);
  subtitulo(ha, "A2:G2", `${subtituloPeriodo}`);
  seccion(ha, 4, 1, 3, "Regla de API aplicada");
  encabezados(ha, 5, 1, ["Regla", "Llamadas", "Transferidas"]);
  const reglas = d.porRegla.length ? d.porRegla : [{ regla: "No hubo llamadas por API en este periodo", llamadas: 0, transferidas: 0 }];
  reglas.forEach((x, i) => {
    const fila = 6 + i;
    celdaDato(ha.getCell(fila, 1), x.regla, { fila: i });
    celdaDato(ha.getCell(fila, 2), x.llamadas, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(ha.getCell(fila, 3), x.transferidas, { alinear: "center", formato: "#,##0", fila: i });
    if (x.regla.startsWith("Sin regla")) for (let c = 1; c <= 3; c++) ha.getCell(fila, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  });
  seccion(ha, 4, 5, 7, "Departamento al que quedaron");
  encabezados(ha, 5, 5, ["Departamento", "Llamadas", "Transferidas"]);
  const deptos = d.porDepartamento.length ? d.porDepartamento : [{ departamento: "Ninguna llamada llegó a un departamento", llamadas: 0, transferidas: 0 }];
  deptos.forEach((x, i) => {
    const fila = 6 + i;
    celdaDato(ha.getCell(fila, 5), x.departamento, { fila: i });
    celdaDato(ha.getCell(fila, 6), x.llamadas, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(ha.getCell(fila, 7), x.transferidas, { alinear: "center", formato: "#,##0", fila: i });
  });
  const filaNota = 6 + Math.max(reglas.length, deptos.length) + 1;
  ha.mergeCells(`A${filaNota}:G${filaNota + 2}`);
  const nota = ha.getCell(`A${filaNota}`);
  nota.value =
    "“Sin regla (guion general)” = la solicitud de la API no traía el campo (etiqueta) que espera alguna regla de Configuración → Integraciones, " +
    "así que la IA usó el guion general de la empresa. Para fijar el departamento de una llamada por API, manda el campo “departamento” " +
    "(nombre o id) en la solicitud.";
  nota.font = { name: "Calibri", size: 10, color: { argb: GRIS_TEXTO } };
  nota.alignment = { wrapText: true, vertical: "top" };
  ha.views = [{ showGridLines: false }];
  configurarImpresion(ha);

  // ════════ Hoja 6: Motivos y solicitudes ════════
  const hm = nuevaHoja("Motivos y solicitudes");
  hm.columns = [{ width: 46 }, { width: 12 }, { width: 14 }, { width: 4 }, { width: 24 }, { width: 12 }, { width: 14 }];
  titulo(hm, "A1:G1", "De qué hablan los clientes", 16);
  subtitulo(hm, "A2:G2", subtituloPeriodo);
  seccion(hm, 4, 1, 3, "Motivos más frecuentes");
  encabezados(hm, 5, 1, ["Motivo (resumido por la IA)", "Llamadas", "Porcentaje"]);
  const motivos = d.motivos.length ? d.motivos : [{ motivo: "Todavía no hay resúmenes en este periodo", n: 0 }];
  const totalMotivos = motivos.reduce((a, x) => a + x.n, 0);
  motivos.forEach((x, i) => {
    const fila = 6 + i;
    celdaDato(hm.getCell(fila, 1), x.motivo.charAt(0).toUpperCase() + x.motivo.slice(1), { fila: i });
    celdaDato(hm.getCell(fila, 2), x.n, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hm.getCell(fila, 3), { formula: `IFERROR(B${fila}/SUM($B$6:$B$${5 + motivos.length}),0)`, result: res(x.n, totalMotivos) }, { alinear: "center", formato: "0%", fila: i });
  });
  barraDeDatos(hm, `C6:C${5 + motivos.length}`, "FFC7D2FE");
  seccion(hm, 4, 5, 7, "Solicitudes que dejó la IA");
  encabezados(hm, 5, 5, ["Tipo", "Solicitudes", "Porcentaje"]);
  const solicitudes = d.solicitudes.length ? d.solicitudes : [{ tipo: "ninguna", n: 0 }];
  const totalSolicitudes = solicitudes.reduce((a, x) => a + x.n, 0);
  solicitudes.forEach((x, i) => {
    const fila = 6 + i;
    celdaDato(hm.getCell(fila, 5), NOMBRE_SOLICITUD[x.tipo] ?? (x.tipo === "ninguna" ? "No se registraron solicitudes" : x.tipo), { fila: i });
    celdaDato(hm.getCell(fila, 6), x.n, { alinear: "center", formato: "#,##0", fila: i });
    celdaDato(hm.getCell(fila, 7), { formula: `IFERROR(F${fila}/SUM($F$6:$F$${5 + solicitudes.length}),0)`, result: res(x.n, totalSolicitudes) }, { alinear: "center", formato: "0%", fila: i });
  });
  barraDeDatos(hm, `G6:G${5 + solicitudes.length}`, "FFA7F3D0");
  hm.views = [{ showGridLines: false }];
  configurarImpresion(hm);

  // ════════ Hoja 7: Detalle ════════
  const hl = nuevaHoja("Detalle", "FF64748B");
  const columnas: { clave: string; titulo: string; ancho: number; tipo?: "telefono" | "duracion" | "texto" }[] = [
    { clave: "fecha", titulo: "Fecha y hora", ancho: 19 },
    { clave: "direccion", titulo: "Dirección", ancho: 11 },
    { clave: "tipo", titulo: "Tipo de llamada", ancho: 20 },
    { clave: "detalle", titulo: "Campaña / origen", ancho: 24 },
    { clave: "numero_cliente", titulo: "Número del cliente", ancho: 17, tipo: "telefono" },
    { clave: "resultado", titulo: "Resultado", ancho: 22 },
    { clave: "departamento", titulo: "Departamento", ancho: 18 },
    { clave: "regla", titulo: "Regla de API", ancho: 24 },
    { clave: "transferida", titulo: "Transferida", ancho: 11 },
    { clave: "duracion_segundos", titulo: "Duración", ancho: 11, tipo: "duracion" },
    { clave: "grabacion", titulo: "Grabación", ancho: 11 },
    { clave: "asesor", titulo: "Asesor", ancho: 20 },
    { clave: "satisfaccion", titulo: "Satisfacción", ancho: 13 },
    { clave: "motivo", titulo: "Motivo", ancho: 34 },
    { clave: "resultado_conversacion", titulo: "Resultado de la conversación", ancho: 40 },
  ];
  hl.columns = columnas.map((c) => ({ width: c.ancho }));
  encabezados(hl, 1, 1, columnas.map((c) => c.titulo));
  const colorResultado: Record<string, string> = {
    "Buzón de voz": "FFFEF3C7",
    "Número inexistente": "FFFEE2E2",
    "No contestó / falló": "FFF1F5F9",
    "Cerrada sin contacto": "FFF1F5F9",
    "Transferida a asesor": "FFD1FAE5",
    Conversación: "FFE0F2FE",
  };
  d.filas.forEach((fila, i) => {
    const rowNum = 2 + i;
    columnas.forEach((c, k) => {
      const celda = hl.getCell(rowNum, 1 + k);
      const crudo = fila[c.clave];
      if (c.tipo === "duracion") {
        celdaDato(celda, Number(crudo ?? 0) / 86400, { alinear: "center", formato: "[h]:mm:ss", fila: i });
      } else if (c.tipo === "telefono") {
        celdaDato(celda, String(crudo ?? "").replace(/[^\d+]/g, ""), { fila: i });
        celda.numFmt = "@"; // texto: Excel no se come el "+"
      } else {
        celdaDato(celda, String(crudo ?? ""), { alinear: ["direccion", "transferida", "grabacion", "satisfaccion"].includes(c.clave) ? "center" : "left", fila: i });
      }
    });
    const colorFila = colorResultado[String(fila.resultado)];
    if (colorFila) hl.getCell(rowNum, 6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorFila } };
  });
  hl.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, 1 + d.filas.length), column: columnas.length } };
  hl.views = [{ state: "frozen", xSplit: 0, ySplit: 1, showGridLines: false }];
  configurarImpresion(hl, "1:1");

  // ════════ Hoja 8: Notas ════════
  const hn = nuevaHoja("Notas", "FF94A3B8");
  hn.columns = [{ width: 30 }, { width: 110 }];
  titulo(hn, "A1:B1", "Cómo leer este reporte", 16);
  const notas: [string, string][] = [
    ["Llamada de IA", "Toda llamada entrante (la contesta primero la IA) y las salientes de campañas, de la API (webhook) y de flujos de trabajo."],
    ["Con conversación", "La IA habló con una persona (hay transcripción) y la llamada no terminó como buzón, número inexistente ni fallida."],
    ["No contestadas", "Buzón de voz, número inexistente o fuera de servicio, ocupado / no contestó / falló, o cerradas por un asesor sin contacto."],
    ["Transferidas a un asesor", "La IA pasó la llamada a una persona. El porcentaje se calcula sobre las llamadas con conversación."],
    ["Atendidas por un asesor", "Transferidas que un asesor contestó."],
    ["Click-to-call (asesor)", "Llamadas de un asesor pedidas desde el CRM. No son de IA, por eso aparecen aparte."],
    ["Las llamadas manuales", "Las que un asesor marca a mano desde el panel de teléfono no se incluyen."],
    ["Duración promedio", "Promedio de las llamadas con conversación, en horas:minutos:segundos."],
    ["Zona horaria", `Fechas y horas en ${d.zona}.`],
    ["Fórmulas", "Los porcentajes y totales son fórmulas: si cambias un número, se recalculan."],
  ];
  notas.forEach(([k, v], i) => {
    const fila = 3 + i;
    celdaDato(hn.getCell(fila, 1), k, { negrita: true, fila: i });
    celdaDato(hn.getCell(fila, 2), v, { fila: i });
    hn.getCell(fila, 2).alignment = { wrapText: true, vertical: "middle", indent: 1 };
    hn.getRow(fila).height = 30;
  });
  hn.views = [{ showGridLines: false }];

  const base = Buffer.from(await libro.xlsx.writeBuffer());
  return inyectarGraficos(base, graficos, nombresHojas);
}
