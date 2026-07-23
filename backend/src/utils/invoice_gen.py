import os
import json
import base64
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm, cm
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics import renderPDF
from reportlab.platypus.flowables import Flowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

from src import database

PDF_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'invoices')

# ──────────────────────────────────────────────
# Helper – QR vector widget (AFIP official URL)
# ──────────────────────────────────────────────
def get_afip_qr_code(order, merchant_cuit, pto_vta, tipo_cmp, cae, size=80):
    cuit_num = int("".join([c for c in str(merchant_cuit) if c.isdigit()]))

    nro_cmp = 1
    if order.get('invoice_number') and '-' in order['invoice_number']:
        try:
            nro_cmp = int(order['invoice_number'].split('-')[1])
        except ValueError:
            pass

    buyer = order.get('buyer', {})
    doc_tipo = 99
    doc_nro = 0
    doc_num_str = buyer.get('document_number') if isinstance(buyer, dict) else None
    doc_type_str = buyer.get('document_type') if isinstance(buyer, dict) else None

    if doc_num_str:
        clean_num = "".join([c for c in str(doc_num_str) if c.isdigit()])
        if clean_num:
            doc_nro = int(clean_num)
            if doc_type_str in ("CUIT", "CUIL", "80"):
                doc_tipo = 80
            else:
                doc_tipo = 96

    cae_exp = order.get('afip_cae_exp', '')
    date_str = order['date_created'].split('T')[0]
    if cae_exp:
        try:
            from datetime import datetime, timedelta
            exp_date = datetime.strptime(str(cae_exp).split('T')[0], '%Y-%m-%d')
            date_str = (exp_date - timedelta(days=10)).strftime('%Y-%m-%d')
        except Exception:
            pass

    qr_data = {
        "ver": 1,
        "fecha": date_str,
        "cuit": cuit_num,
        "ptoVta": pto_vta,
        "tipoCmp": tipo_cmp,
        "nroCmp": nro_cmp,
        "importe": float(order['total_amount']),
        "moneda": "PES",
        "ctz": 1.0,
        "tipoDocRec": doc_tipo,
        "nroDocRec": doc_nro,
        "tipoCodAut": "E",
        "codAut": int("".join([c for c in str(cae) if c.isdigit()])) if cae else 0
    }

    qr_json_b64 = base64.b64encode(json.dumps(qr_data).encode('utf-8')).decode('utf-8')
    qr_url = f"https://www.afip.gob.ar/fe/qr/?p={qr_json_b64}"

    qr_widget = QrCodeWidget(qr_url)
    qr_widget.barWidth = size
    qr_widget.barHeight = size
    qr_widget.qrVersion = 5

    d = Drawing(size, size)
    d.add(qr_widget)
    return d


# ──────────────────────────────────────────────
# Custom Flowable: Header Box (AFIP-standard)
# Renders the top 3-column header:
#  [Seller Info] | [Letter Box] | [FACTURA + numbering]
# With ORIGINAL/DUPLICADO band at top
# ──────────────────────────────────────────────
class AFIPHeaderFlowable(Flowable):
    def __init__(self, seller, letter_char, cod_cmp, invoice_number, invoice_date, 
                 cuit, iibb, iva_condition, start_date, pto_vta, tipo_cmp, width, copy_type="ORIGINAL"):
        super().__init__()
        self.seller = seller
        self.letter_char = letter_char
        self.cod_cmp = cod_cmp
        self.invoice_number = invoice_number
        self.invoice_date = invoice_date
        self.cuit = cuit
        self.iibb = iibb
        self.iva_condition = iva_condition
        self.start_date = start_date
        self.pto_vta = pto_vta
        self.tipo_cmp = tipo_cmp
        self.width = width
        self.copy_type = copy_type
        self.height = 100 * mm

    def draw(self):
        c = self.canv
        w = self.width
        h = self.height

        # ─── Outer border ───
        c.setStrokeColor(colors.HexColor('#333333'))
        c.setLineWidth(1.0)
        c.rect(0, 0, w, h)

        # ─── Copy type band (ORIGINAL / DUPLICADO) ───
        band_h = 8 * mm
        c.setFillColor(colors.HexColor('#f0f0f0'))
        c.rect(0, h - band_h, w, band_h, fill=1, stroke=0)
        c.setStrokeColor(colors.HexColor('#333333'))
        c.setLineWidth(0.6)
        c.line(0, h - band_h, w, h - band_h)

        c.setFillColor(colors.HexColor('#333333'))
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(w / 2, h - 6 * mm, self.copy_type)

        # ─── Center vertical divider (below band) ───
        center_x = w / 2
        content_top = h - band_h
        c.setLineWidth(0.6)
        c.line(center_x, 0, center_x, content_top)

        # ─── LEFT COLUMN: Seller info ───
        left_margin = 5 * mm
        y = content_top - 8 * mm

        # Razón Social (large, bold)
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(colors.HexColor('#1a1a1a'))
        name = self.seller.get('name', '')
        # Truncate if too long for column
        if len(name) > 32:
            name = name[:30] + "…"
        c.drawString(left_margin, y, name)

        # Razón Social subtitle
        razon = self.seller.get('razon_social', self.seller.get('name', ''))
        if razon and razon != name:
            y -= 5 * mm
            c.setFont("Helvetica", 7)
            c.setFillColor(colors.HexColor('#666666'))
            c.drawString(left_margin, y, f"Razón Social: {razon}")

        # Address
        y -= 5 * mm
        c.setFont("Helvetica", 7.5)
        c.setFillColor(colors.HexColor('#444444'))
        address = self.seller.get('address', '')
        if len(address) > 48:
            address = address[:46] + "…"
        c.drawString(left_margin, y, f"Domicilio Comercial: {address}")

        # IVA condition
        y -= 5 * mm
        c.setFont("Helvetica", 7.5)
        c.setFillColor(colors.HexColor('#444444'))
        c.drawString(left_margin, y, f"Condición frente al IVA: {self.iva_condition}")

        # Separator line
        y -= 3 * mm
        c.setStrokeColor(colors.HexColor('#cccccc'))
        c.setLineWidth(0.3)
        c.line(left_margin, y, center_x - 4 * mm, y)

        # CUIT formatted XX-XXXXXXXX-X
        cuit_clean = "".join([x for x in str(self.cuit) if x.isdigit()])
        cuit_fmt = self.cuit if '-' in str(self.cuit) else (
            f"{cuit_clean[0:2]}-{cuit_clean[2:10]}-{cuit_clean[10]}" if len(cuit_clean) == 11 else self.cuit
        )
        y -= 4.5 * mm
        c.setFillColor(colors.HexColor('#1a1a1a'))
        c.setFont("Helvetica-Bold", 8)
        c.drawString(left_margin, y, "CUIT: ")
        cuit_w = c.stringWidth("CUIT: ", "Helvetica-Bold", 8)
        c.setFont("Helvetica", 8)
        c.drawString(left_margin + cuit_w, y, cuit_fmt)

        # IIBB
        y -= 4.5 * mm
        c.setFont("Helvetica-Bold", 8)
        c.drawString(left_margin, y, "Ingresos Brutos: ")
        iibb_w = c.stringWidth("Ingresos Brutos: ", "Helvetica-Bold", 8)
        c.setFont("Helvetica", 8)
        c.drawString(left_margin + iibb_w, y, str(self.iibb or cuit_fmt))

        # Start date
        y -= 4.5 * mm
        c.setFont("Helvetica-Bold", 8)
        c.drawString(left_margin, y, "Inicio de Actividades: ")
        start_w = c.stringWidth("Inicio de Actividades: ", "Helvetica-Bold", 8)
        c.setFont("Helvetica", 8)
        c.drawString(left_margin + start_w, y, self.start_date)

        # ─── CENTER LETTER BOX ───
        box_size = 16 * mm
        box_x = center_x - (box_size / 2)
        box_y = content_top - box_size

        # Box shadow effect
        c.setFillColor(colors.HexColor('#e0e0e0'))
        c.rect(box_x + 0.5 * mm, box_y - 0.5 * mm, box_size, box_size, fill=1, stroke=0)

        # Main box
        c.setStrokeColor(colors.HexColor('#333333'))
        c.setLineWidth(1.2)
        c.setFillColor(colors.white)
        c.rect(box_x, box_y, box_size, box_size, fill=1, stroke=1)

        # Letter
        c.setFillColor(colors.HexColor('#1a1a1a'))
        c.setFont("Helvetica-Bold", 24)
        c.drawCentredString(center_x, box_y + 5.5 * mm, self.letter_char)

        # Code below letter
        c.setFont("Helvetica-Bold", 6.5)
        c.setFillColor(colors.HexColor('#555555'))
        c.drawCentredString(center_x, box_y + 1.5 * mm, self.cod_cmp)

        # ─── RIGHT COLUMN: Invoice info ───
        rx = center_x + 12 * mm
        y2 = content_top - 6 * mm

        # "FACTURA" title
        c.setFont("Helvetica-Bold", 18)
        c.setFillColor(colors.HexColor('#1a1a1a'))
        c.drawString(rx, y2, "FACTURA")

        # Punto de Venta and Comp. Nro
        y2 -= 8 * mm
        inv_parts = str(self.invoice_number).split('-')
        pto_str = inv_parts[0] if len(inv_parts) == 2 else f"{self.pto_vta:04d}"
        nro_str = inv_parts[1] if len(inv_parts) == 2 else "00000001"

        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.HexColor('#444444'))
        c.drawString(rx, y2, "Punto de Venta: ")
        pv_w = c.stringWidth("Punto de Venta: ", "Helvetica-Bold", 8)
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor('#1a1a1a'))
        c.drawString(rx + pv_w, y2, pto_str)

        # Comp Nro on same line
        comp_x = rx + pv_w + c.stringWidth(pto_str + "   ", "Helvetica", 9)
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.HexColor('#444444'))
        c.drawString(comp_x, y2, "Comp. Nro: ")
        cn_w = c.stringWidth("Comp. Nro: ", "Helvetica-Bold", 8)
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor('#1a1a1a'))
        c.drawString(comp_x + cn_w, y2, nro_str)

        # Fecha de Emisión
        y2 -= 6 * mm
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.HexColor('#444444'))
        c.drawString(rx, y2, "Fecha de Emisión: ")
        fe_w = c.stringWidth("Fecha de Emisión: ", "Helvetica-Bold", 8)
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor('#1a1a1a'))
        c.drawString(rx + fe_w, y2, self.invoice_date)


# ──────────────────────────────────────────────
# Build a single invoice page (story elements)
# ──────────────────────────────────────────────
def _build_invoice_page(order, copy_type, usable_w):
    """Builds all the flowable elements for one page of the invoice (ORIGINAL or DUPLICADO)."""

    # ---- Load merchant settings ----
    merchant_name = database.get_setting('merchant_name', 'Hidroponia Rosario')
    merchant_cuit = database.get_setting('afip_cuit', '30-71234567-9')
    merchant_address = database.get_setting('merchant_address', 'Bv. Oroño 4500, Rosario, Santa Fe')
    merchant_phone = database.get_setting('merchant_phone', '+54 341 456-7890')
    merchant_iibb = database.get_setting('merchant_iibb', '')
    merchant_iva_condition = database.get_setting('merchant_iva_condition', 'Responsable Monotributo')
    merchant_start_date = database.get_setting('merchant_start_date', '01/01/2020')

    pto_vta_val = int(database.get_setting('afip_pto_vta', '1'))
    tipo_cmp_val = int(order.get('cbte_tipo') or database.get_setting('afip_type_cmp', '11'))

    if tipo_cmp_val == 1:
        letter_char = "A"
    elif tipo_cmp_val == 6:
        letter_char = "B"
    else:
        letter_char = "C"

    cod_cmp = f"COD. {tipo_cmp_val:03d}"

    invoice_number = order.get('invoice_number', f"{pto_vta_val:04d}-00000001")
    cae = order.get('afip_cae', '')
    cae_exp = order.get('afip_cae_exp', '')

    # Parse date (Invoice Date)
    formatted_date = None
    if cae_exp:
        try:
            from datetime import timedelta
            exp_date = datetime.strptime(str(cae_exp).split('T')[0], '%Y-%m-%d')
            formatted_date = (exp_date - timedelta(days=10)).strftime("%d/%m/%Y")
        except Exception:
            pass

    if not formatted_date:
        try:
            order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00'))
            formatted_date = order_date.strftime("%d/%m/%Y")
        except Exception:
            formatted_date = datetime.now().strftime("%d/%m/%Y")

    # ---- Buyer info ----
    buyer = order.get('buyer', {})
    if not isinstance(buyer, dict):
        buyer = {}

    buyer_name = buyer.get('name') or buyer.get('nickname') or 'Consumidor Final'
    buyer_doc_number = buyer.get('document_number', '')
    buyer_doc_type = buyer.get('document_type', 'DNI')
    buyer_address = buyer.get('address', '') or ''
    buyer_condition = 'Consumidor Final'

    if buyer_doc_type in ('CUIT', 'CUIL') and buyer_doc_number:
        buyer_condition = 'Responsable Inscripto'

    # Format doc number
    buyer_doc_display = 'S/D (Consumidor Final)'
    if buyer_doc_number:
        clean = "".join([c for c in str(buyer_doc_number) if c.isdigit()])
        if buyer_doc_type in ('CUIT', 'CUIL') and len(clean) == 11:
            buyer_doc_display = f"{clean[0:2]}-{clean[2:10]}-{clean[10]}"
        elif clean:
            buyer_doc_display = str(buyer_doc_number)

    # ---- Styles ----
    BORDER = colors.HexColor('#333333')
    HEADER_BG = colors.HexColor('#e8e8e8')
    LIGHT_GRAY = colors.HexColor('#f5f5f5')
    LABEL_COLOR = colors.HexColor('#666666')
    BLACK = colors.black
    BLUE_ARCA = colors.HexColor('#003A70')

    def style(name, font='Helvetica', size=8, color=colors.black, align=TA_LEFT, bold=False):
        return ParagraphStyle(
            f"{name}_{copy_type}",
            fontName='Helvetica-Bold' if bold else font,
            fontSize=size,
            textColor=color,
            alignment=align,
            leading=size + 2
        )

    story = []

    # ══════════════════════════════════════════
    # 1. MAIN HEADER (ORIGINAL/DUPLICADO + Seller + Letter)
    # ══════════════════════════════════════════
    seller = {
        'name': merchant_name,
        'razon_social': merchant_name,
        'address': merchant_address,
    }
    header = AFIPHeaderFlowable(
        seller=seller,
        letter_char=letter_char,
        cod_cmp=cod_cmp,
        invoice_number=invoice_number,
        invoice_date=formatted_date,
        cuit=merchant_cuit,
        iibb=merchant_iibb,
        iva_condition=merchant_iva_condition,
        start_date=merchant_start_date,
        pto_vta=pto_vta_val,
        tipo_cmp=tipo_cmp_val,
        width=usable_w,
        copy_type=copy_type
    )
    story.append(header)
    story.append(Spacer(1, 4 * mm))

    # ══════════════════════════════════════════
    # 2. BUYER INFO ROW
    # ══════════════════════════════════════════
    buyer_left_data = [
        [
            Paragraph(f"<b>Período Facturado Desde:</b> {formatted_date}",
                      style('pfl', size=7, color=BLACK)),
            Paragraph(f"<b>Hasta:</b> {formatted_date}",
                      style('pfh', size=7, color=BLACK)),
            Paragraph(f"<b>Fecha de Vto. para el pago:</b> {formatted_date}",
                      style('pfv', size=7, color=BLACK)),
        ]
    ]
    period_table = Table(buyer_left_data, colWidths=[usable_w * 0.33] * 3)
    period_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_GRAY),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(period_table)
    story.append(Spacer(1, 2 * mm))

    # Buyer main info row
    doc_label = buyer_doc_type if buyer_doc_type else 'DNI'
    buyer_info = [
        [
            Paragraph(f"<b>{doc_label}:</b> {buyer_doc_display}", style('bi1', size=8, color=BLACK)),
            Paragraph(f"<b>Apellido y Nombre / Razón Social:</b> {buyer_name}", style('bi2', size=8, color=BLACK)),
        ],
        [
            Paragraph(f"<b>Condición frente al IVA:</b> {buyer_condition}", style('bi3', size=8, color=BLACK)),
            Paragraph(f"<b>Domicilio:</b> {buyer_address}", style('bi4', size=8, color=BLACK)),
        ],
        [
            Paragraph(f"<b>Condición de venta:</b> Contado", style('bi5', size=8, color=BLACK)),
            Paragraph("", style('bi6', size=8, color=BLACK)),
        ]
    ]

    buyer_table = Table(buyer_info, colWidths=[usable_w * 0.3, usable_w * 0.7])
    buyer_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(buyer_table)
    story.append(Spacer(1, 3 * mm))

    # ══════════════════════════════════════════
    # 3. ITEMS TABLE
    # ══════════════════════════════════════════
    col_w = [
        usable_w * 0.08,   # Código
        usable_w * 0.35,   # Producto / Servicio
        usable_w * 0.08,   # Cantidad
        usable_w * 0.10,   # U. Medida
        usable_w * 0.14,   # Precio Unit.
        usable_w * 0.10,   # % Bonif.
        usable_w * 0.07,   # Imp. Bonif.
        usable_w * 0.08,   # Subtotal
    ]

    hdr_style = style('th', size=7, color=BLACK, bold=True, align=TA_CENTER)
    cell_style = style('td', size=8, color=BLACK, align=TA_LEFT)
    num_style = style('tdnum', size=8, color=BLACK, align=TA_RIGHT)

    items_data = [[
        Paragraph('Código', hdr_style),
        Paragraph('Producto / Servicio', hdr_style),
        Paragraph('Cantidad', hdr_style),
        Paragraph('U. Medida', hdr_style),
        Paragraph('Precio Unit.', hdr_style),
        Paragraph('% Bonif.', hdr_style),
        Paragraph('Imp. Bonif.', hdr_style),
        Paragraph('Subtotal', hdr_style),
    ]]

    items = order.get('items', [])
    for idx, item in enumerate(items):
        qty = item.get('quantity', 1)
        title = item.get('title', 'Producto')
        unit_price = item.get('unit_price', 0) or (order.get('total_amount', 0) / qty if qty else 0)
        subtotal = unit_price * qty
        item_id = str(item.get('id', idx + 1))[:8]

        items_data.append([
            Paragraph(item_id, num_style),
            Paragraph(title, cell_style),
            Paragraph(f"{qty:.2f}", num_style),
            Paragraph('unidades', style('um', size=7, color=LABEL_COLOR, align=TA_CENTER)),
            Paragraph(f"${unit_price:,.2f}", num_style),
            Paragraph('0,00', num_style),
            Paragraph('0,00', num_style),
            Paragraph(f"${subtotal:,.2f}", num_style),
        ])

    # Ensure minimum height with at least 8 blank rows visible
    for _ in range(max(0, 8 - len(items))):
        items_data.append(['', '', '', '', '', '', '', ''])

    items_table = Table(items_data, colWidths=col_w, repeatRows=1)
    items_table.setStyle(TableStyle([
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        # Body
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        # Grid
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#cccccc')),
        # Valign
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        # Alternate rows
        *[('BACKGROUND', (0, i), (-1, i), LIGHT_GRAY) for i in range(2, len(items_data), 2)],
    ]))
    story.append(items_table)
    story.append(Spacer(1, 3 * mm))

    # ══════════════════════════════════════════
    # 4. TOTALS TABLE (right-aligned)
    # ══════════════════════════════════════════
    total_amount = float(order.get('total_amount', 0))
    if letter_char == "A":
        imp_neto = round(total_amount / 1.21, 2)
        imp_iva = round(total_amount - imp_neto, 2)
        totals_data = [
            [Paragraph('Importe Neto Gravado:', style('tl', size=8.5, bold=True, align=TA_RIGHT)),
             Paragraph(f"$ {imp_neto:,.2f}", style('tv', size=8.5, align=TA_RIGHT))],
            [Paragraph('IVA 21%:', style('tl2', size=8.5, bold=True, align=TA_RIGHT)),
             Paragraph(f"$ {imp_iva:,.2f}", style('tv2', size=8.5, align=TA_RIGHT))],
            [Paragraph('Importe Otros Tributos:', style('tl3', size=8.5, bold=True, align=TA_RIGHT)),
             Paragraph("$ 0,00", style('tv3', size=8.5, align=TA_RIGHT))],
            [Paragraph('Importe Total:', style('tl4', size=10, bold=True, align=TA_RIGHT)),
             Paragraph(f"$ {total_amount:,.2f}", style('tv4', size=10, bold=True, align=TA_RIGHT))],
        ]
    else:
        totals_data = [
            [Paragraph('Subtotal:', style('tl', size=9, bold=True, align=TA_RIGHT)),
             Paragraph(f"$ {total_amount:,.2f}", style('tv', size=9, align=TA_RIGHT))],
            [Paragraph('Importe Otros Tributos:', style('tl2', size=9, bold=True, align=TA_RIGHT)),
             Paragraph("$ 0,00", style('tv2', size=9, align=TA_RIGHT))],
            [Paragraph('Importe Total:', style('tl3', size=10, bold=True, align=TA_RIGHT)),
             Paragraph(f"$ {total_amount:,.2f}", style('tv3', size=10, bold=True, align=TA_RIGHT))],
        ]

    totals_table = Table(totals_data, colWidths=[usable_w * 0.7, usable_w * 0.3])
    totals_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ('LINEABOVE', (0, -1), (-1, -1), 0.8, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, -1), (-1, -1), LIGHT_GRAY),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 5 * mm))

    # ══════════════════════════════════════════
    # 5. ARCA FOOTER (QR + CAE + Legalese)
    # ══════════════════════════════════════════
    if cae:
        cae_exp_fmt = cae_exp
        try:
            cae_exp_fmt = datetime.strptime(str(cae_exp), '%Y-%m-%d').strftime('%d/%m/%Y')
        except Exception:
            pass

        qr_drawing = get_afip_qr_code(order, merchant_cuit, pto_vta_val, tipo_cmp_val, cae, size=55)

        arca_logo_para = Paragraph(
            '<b><font color="#003A70" size="14">ARCA</font></b><br/>'
            '<font color="#666666" size="6.5">AGENCIA DE RECAUDACIÓN<br/>Y CONTROL ADUANERO</font>',
            style('arcaLogo', size=7, color=BLUE_ARCA)
        )

        authorized_para = Paragraph(
            '<b>Comprobante Autorizado</b>',
            style('auth', size=8, color=BLACK, bold=True)
        )

        cae_para = Paragraph(
            f'<b>CAE N°:</b> {cae}<br/>'
            f'<b>Fecha de Vto. de CAE:</b> {cae_exp_fmt}',
            style('caeinfo', size=9, color=BLACK, align=TA_RIGHT)
        )

        footer_data = [[qr_drawing, arca_logo_para, authorized_para, cae_para]]
        footer_col_w = [60, 60, usable_w - 60 - 60 - 130, 130]

        footer_table = Table(footer_data, colWidths=footer_col_w)
        footer_table.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(footer_table)
        story.append(Spacer(1, 3 * mm))

    # Legal disclaimer
    disclaimer = Paragraph(
        'Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación.',
        style('disc', size=7, color=LABEL_COLOR, align=TA_CENTER)
    )
    story.append(disclaimer)

    return story


# ──────────────────────────────────────────────
# Main generator
# ──────────────────────────────────────────────
def generate_invoice_pdf(order):
    os.makedirs(PDF_DIR, exist_ok=True)
    filename = f"factura_{order['order_id']}.pdf"
    filepath = os.path.join(PDF_DIR, filename)

    page_w, page_h = A4
    margin = 15 * mm
    usable_w = page_w - 2 * margin

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        rightMargin=margin,
        leftMargin=margin,
        topMargin=margin,
        bottomMargin=margin
    )

    # Build both copies: ORIGINAL (page 1) + DUPLICADO (page 2)
    story = []

    # Page 1: ORIGINAL
    story.extend(_build_invoice_page(order, "ORIGINAL", usable_w))

    # Page break
    story.append(PageBreak())

    # Page 2: DUPLICADO
    story.extend(_build_invoice_page(order, "DUPLICADO", usable_w))

    doc.build(story)
    return filepath
