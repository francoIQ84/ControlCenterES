import os
import base64
import random
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from urllib3.util import create_urllib3_context
from src import database

class ArcaSSLAdapter(requests.adapters.HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        # Create custom SSL context to lower security level to SECLEVEL=1
        # This allows connecting to AFIP legacy DH cipher suites (fixes DH_KEY_TOO_SMALL)
        context = create_urllib3_context()
        context.set_ciphers('DEFAULT@SECLEVEL=1')
        kwargs['ssl_context'] = context
        return super().init_poolmanager(*args, **kwargs)

def get_session():
    s = requests.Session()
    s.mount('https://', ArcaSSLAdapter())
    return s

def generate_csr_and_key(cuit: str, company_name: str):
    """
    Generates a 2048-bit RSA private key and a CSR (Certificate Signing Request) 
    in PEM format formatted specifically for AFIP.
    """
    os.makedirs("backend/data/afip", exist_ok=True)
    key_path = "backend/data/afip/arca.key"
    csr_path = "backend/data/afip/arca.csr"
    
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    
    # 1. Generate RSA key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048
    )
    
    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    )
    with open(key_path, "wb") as f:
        f.write(key_pem)
        
    # 2. Generate CSR (AFIP requires CUIT serialNumber)
    clean_cuit = cuit.replace("-", "").strip()
    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, company_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, company_name),
        x509.NameAttribute(NameOID.SERIAL_NUMBER, f"CUIT {clean_cuit}"),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "AR"),
    ])
    
    csr = x509.CertificateSigningRequestBuilder().subject_name(
        subject
    ).sign(private_key, hashes.SHA256())
    
    csr_pem = csr.public_bytes(serialization.Encoding.PEM)
    with open(csr_path, "wb") as f:
        f.write(csr_pem)
        
    return csr_pem.decode('utf-8'), key_pem.decode('utf-8')

def get_wsaa_token(cuit: str, cert_path: str, key_path: str, env: str, service: str = "wsfe"):
    """
    Authenticates with AFIP WSAA and returns a tuple (token, sign).
    """
    # 1. Create TRA XML
    now = datetime.now()
    gen_time = (now - timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%S")
    exp_time = (now + timedelta(hours=10)).strftime("%Y-%m-%dT%H:%M:%S")
    unique_id = random.randint(10000, 99999)
    
    tra_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>{unique_id}</uniqueId>
    <generationTime>{gen_time}</generationTime>
    <expirationTime>{exp_time}</expirationTime>
  </header>
  <service>{service}</service>
</loginTicketRequest>"""

    # 2. Sign TRA XML with PKCS#7 using private key & cert
    with open(key_path, "rb") as f:
        key_data = f.read()
    with open(cert_path, "rb") as f:
        cert_data = f.read()
        
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.serialization import pkcs7
    from cryptography import x509
    
    private_key = serialization.load_pem_private_key(key_data, password=None)
    cert = x509.load_pem_x509_certificate(cert_data)
    
    signature = pkcs7.PKCS7SignatureBuilder().set_data(
        tra_xml.encode('utf-8')
    ).add_signer(
        cert, private_key, hashes.SHA256()
    ).sign(serialization.Encoding.DER, [])
    
    cms_b64 = base64.b64encode(signature).decode('utf-8')
    
    # 3. Post SOAP Envelope to WSAA
    wsaa_url = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms" if env == "homologacion" else "https://wsaa.afip.gov.ar/ws/services/LoginCms"
    
    soap_request = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">
      <in0>{cms_b64}</in0>
    </loginCms>
  </soap:Body>
</soap:Envelope>"""

    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": '""',
        "Connection": "close"
    }
    
    res = get_session().post(wsaa_url, data=soap_request, headers=headers, timeout=30.0)
    if res.status_code != 200:
        # Extract SOAP Fault details from AFIP's response
        try:
            err_root = ET.fromstring(res.text)
            faultstring = None
            for item in err_root.iter():
                if item.tag.endswith("faultstring"):
                    faultstring = item.text
                    break
            if faultstring:
                raise Exception(f"WSAA AFIP: {faultstring}")
        except ET.ParseError:
            pass
        raise Exception(f"Error de conexión con WSAA (HTTP {res.status_code})")
        
    root = ET.fromstring(res.text)
    return_val = None
    for item in root.iter():
        if item.tag.endswith("loginCmsReturn"):
            return_val = item.text
            break
            
    if not return_val:
        raise Exception("Respuesta del WSAA inválida")
        
    inner_root = ET.fromstring(return_val)
    token = inner_root.find(".//token").text
    sign = inner_root.find(".//sign").text
    return token, sign

def call_wsfe(action: str, body_content: str, env: str):
    ws_url = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" if env == "homologacion" else "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
    
    soap_request = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    {body_content}
  </soap:Body>
</soap:Envelope>"""

    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f"\"http://ar.gov.afip.dif.FEV1/{action}\"",
        "Connection": "close"
    }
    
    res = get_session().post(ws_url, data=soap_request, headers=headers, timeout=30.0)
    if res.status_code != 200:
        raise Exception(f"Error de comunicación WSFE (HTTP {res.status_code})")
        
    return ET.fromstring(res.text)

def get_last_invoice_number(token: str, sign: str, cuit: str, pto_vta: int, cbte_tipo: int, env: str):
    body = f"""<FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>{token}</Token>
        <Sign>{sign}</Sign>
        <Cuit>{cuit}</Cuit>
      </Auth>
      <PtoVta>{pto_vta}</PtoVta>
      <CbteTipo>{cbte_tipo}</CbteTipo>
    </FECompUltimoAutorizado>"""
    
    root = call_wsfe("FECompUltimoAutorizado", body, env)
    
    cbte_nro_node = root.find(".//{http://ar.gov.afip.dif.FEV1/}CbteNro")
    if cbte_nro_node is not None:
        return int(cbte_nro_node.text)
        
    error_nodes = root.findall(".//{http://ar.gov.afip.dif.FEV1/}Err")
    if error_nodes:
        err_msg = ", ".join([f"{e.find('{http://ar.gov.afip.dif.FEV1/}Msg').text}" for e in error_nodes if e.find('{http://ar.gov.afip.dif.FEV1/}Msg') is not None])
        raise Exception(err_msg)
        
    raise Exception("Error al obtener último número de factura")

def request_cae(token: str, sign: str, cuit: str, pto_vta: int, cbte_tipo: int, invoice_number: int, doc_tipo: int, doc_nro: int, amount: float, env: str, concept: int = 1):
    today_str = datetime.now().strftime("%Y%m%d")
    
    # Calculate IVA breakdown for Factura A (CbteTipo 1)
    if cbte_tipo == 1:
        imp_neto = round(amount / 1.21, 2)
        imp_iva = round(amount - imp_neto, 2)
        iva_xml = f"""<Iva>
              <AlicIva>
                <Id>5</Id>
                <BaseImp>{imp_neto:.2f}</BaseImp>
                <Importe>{imp_iva:.2f}</Importe>
              </AlicIva>
            </Iva>"""
    else:
        imp_neto = amount
        imp_iva = 0.0
        iva_xml = ""

    body = f"""<FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>{token}</Token>
        <Sign>{sign}</Sign>
        <Cuit>{cuit}</Cuit>
      </Auth>
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>{pto_vta}</PtoVta>
          <CbteTipo>{cbte_tipo}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>{concept}</Concepto>
            <DocTipo>{doc_tipo}</DocTipo>
            <DocNro>{doc_nro}</DocNro>
            <CbteDesde>{invoice_number}</CbteDesde>
            <CbteHasta>{invoice_number}</CbteHasta>
            <CbteFch>{today_str}</CbteFch>
            <ImpTotal>{amount:.2f}</ImpTotal>
            <ImpTotConc>0</ImpTotConc>
            <ImpNeto>{imp_neto:.2f}</ImpNeto>
            <ImpOpEx>0</ImpOpEx>
            <ImpTrib>0</ImpTrib>
            <ImpIVA>{imp_iva:.2f}</ImpIVA>
            <MonId>PES</MonId>
            <MonCotiz>1</MonCotiz>
            {iva_xml}
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
    </FECAESolicitar>"""
    
    root = call_wsfe("FECAESolicitar", body, env)
    
    resultado_node = root.find(".//{http://ar.gov.afip.dif.FEV1/}Resultado")
    if resultado_node is not None:
        resultado = resultado_node.text
        if resultado == "A":
            cae = root.find(".//{http://ar.gov.afip.dif.FEV1/}CAE").text
            fch_vto = root.find(".//{http://ar.gov.afip.dif.FEV1/}CAEFchVto").text
            fch_vto_formatted = f"{fch_vto[:4]}-{fch_vto[4:6]}-{fch_vto[6:]}"
            return cae, fch_vto_formatted
            
    obs_nodes = root.findall(".//{http://ar.gov.afip.dif.FEV1/}Obs")
    err_nodes = root.findall(".//{http://ar.gov.afip.dif.FEV1/}Err")
    
    err_msg = ""
    if err_nodes:
        err_msg += ", ".join([f"{e.find('{http://ar.gov.afip.dif.FEV1/}Msg').text}" for e in err_nodes if e.find('{http://ar.gov.afip.dif.FEV1/}Msg') is not None])
    if obs_nodes:
        if err_msg: err_msg += " | Observaciones: "
        err_msg += ", ".join([f"{o.find('{http://ar.gov.afip.dif.FEV1/}Msg').text}" for o in obs_nodes if o.find('{http://ar.gov.afip.dif.FEV1/}Msg') is not None])
        
    if not err_msg:
        err_msg = "Comprobante rechazado por ARCA sin errores explícitos."
        
    raise Exception(err_msg)

def create_invoice(order: dict):
    """
    Core entrypoint that handles the WSAA and WSFE workflow,
    returns dict with invoice details. Falls back to mock values if credentials
    are not loaded or AFIP integration is in demo/mock status.
    """
    afip_enabled = database.get_setting('afip_enabled', '0') == '1'
    cuit_raw = database.get_setting('afip_cuit', '30-71234567-9')
    cuit = cuit_raw.replace("-", "").strip()
    pto_vta = int(database.get_setting('afip_pto_vta', '1'))
    cbte_tipo = int(database.get_setting('afip_type_cmp', '11'))
    env = database.get_setting('afip_environment', 'homologacion')
    concept = int(database.get_setting('afip_concept', '1'))
    
    cert_path = "backend/data/afip/arca.crt"
    key_path = "backend/data/afip/arca.key"
    has_credentials = os.path.exists(cert_path) and os.path.exists(key_path)
    
    if not afip_enabled or not has_credentials:
        # Mock mode fallback
        last_invoice_number = database.get_last_invoice_number_for_pto(pto_vta, cbte_tipo)
        new_invoice_number = (last_invoice_number or 0) + 1
        formatted_invoice_number = f"{pto_vta:04d}-{new_invoice_number:08d}"
        
        cae = f"76{random.randint(100000000000, 999999999999)}"
        cae_exp = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        
        database.save_order_afip_details(order['order_id'], formatted_invoice_number, cae, cae_exp)
        
        order['invoice_number'] = formatted_invoice_number
        order['afip_cae'] = cae
        order['afip_cae_exp'] = cae_exp
        
        from src.utils.invoice_gen import generate_invoice_pdf
        pdf_path = generate_invoice_pdf(order)
        
        meli_uploaded = False
        meli_msg = ""
        if order.get('source_platform') == 'MERCADOLIBRE':
            from src import meli_api
            meli_uploaded, meli_msg = meli_api.upload_invoice_to_meli(order['order_id'], pdf_path)
        
        return {
            "success": True,
            "invoice_number": formatted_invoice_number,
            "cae": cae,
            "cae_exp": cae_exp,
            "mode": "mock",
            "meli_uploaded": meli_uploaded,
            "meli_msg": meli_msg
        }
        
    try:
        # 1. Fetch updated buyer billing info from Mercado Libre if source_platform is MERCADOLIBRE
        if order.get('source_platform') == 'MERCADOLIBRE':
            from src import meli_api
            ml_billing = meli_api.fetch_order_billing_info(order['order_id'])
            if ml_billing:
                # Merge Mercado Libre billing info into our order's buyer dictionary
                buyer = order.get('buyer', {})
                if not isinstance(buyer, dict):
                    buyer = {}
                
                # Keep existing values if new ones are empty
                if ml_billing.get('document_type'):
                    buyer['document_type'] = ml_billing['document_type']
                if ml_billing.get('document_number'):
                    buyer['document_number'] = ml_billing['document_number']
                if ml_billing.get('name'):
                    buyer['name'] = ml_billing['name']
                if ml_billing.get('address'):
                    buyer['address'] = ml_billing['address']
                    
                order['buyer'] = buyer

        # 2. Verify CUIT against AFIP if document_type is CUIT/CUIL
        buyer = order.get('buyer', {})
        doc_num_str = buyer.get('document_number') if isinstance(buyer, dict) else None
        doc_type_str = buyer.get('document_type') if isinstance(buyer, dict) else None
        
        # Format CUIT or verify length
        is_cuit = False
        if doc_type_str in ("CUIT", "CUIL", "80"):
            is_cuit = True
        elif doc_num_str and len("".join([c for c in str(doc_num_str) if c.isdigit()])) == 11:
            is_cuit = True

        if is_cuit and doc_num_str:
            # Query official AFIP PersonaServiceA5 (Padron)
            afip_info = lookup_cuit(doc_num_str)
            if afip_info.get('success'):
                # Override with verified Razón Social & Address
                buyer['name'] = afip_info.get('razon_social', buyer.get('name'))
                buyer['address'] = afip_info.get('direccion', buyer.get('address'))
                buyer['document_type'] = 'CUIT'
                order['buyer'] = buyer

        # 3. Persist these validated buyer details to local database
        if isinstance(buyer, dict) and buyer.get('id'):
            with database.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute('''
                        INSERT INTO customers 
                        (buyer_id, nickname, full_name, document_type, document_number, address)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (buyer_id) DO UPDATE SET
                            full_name = EXCLUDED.full_name,
                            document_type = EXCLUDED.document_type,
                            document_number = EXCLUDED.document_number,
                            address = EXCLUDED.address
                    ''', (
                        buyer.get('id'),
                        buyer.get('nickname', ''),
                        buyer.get('name', ''),
                        buyer.get('document_type', ''),
                        buyer.get('document_number', ''),
                        buyer.get('address', '')
                    ))

        # Real AFIP integration flow
        token, sign = get_wsaa_token(cuit, cert_path, key_path, env)
        
        # Determine buyer doc type and number
        doc_tipo = 99  # Consumidor final by default
        doc_nro = 0

        if doc_num_str:
            clean_num = "".join([c for c in str(doc_num_str) if c.isdigit()])
            if clean_num:
                doc_nro = int(clean_num)
                if doc_type_str in ("CUIT", "CUIL", "80"):
                    doc_tipo = 80
                else:
                    doc_tipo = 96  # DNI
                    
        # Check automatic fallback for Factura A if buyer is Consumidor Final (DocTipo != 80)
        actual_cbte_tipo = cbte_tipo
        if cbte_tipo == 1 and doc_tipo != 80:
            actual_cbte_tipo = 6  # Issue Factura B if buyer is not a CUIT

        # Obtain next invoice number
        last_num = get_last_invoice_number(token, sign, cuit, pto_vta, actual_cbte_tipo, env)
        new_num = last_num + 1
        
        # Request CAE from WSFE
        cae, cae_exp = request_cae(
            token=token,
            sign=sign,
            cuit=cuit,
            pto_vta=pto_vta,
            cbte_tipo=actual_cbte_tipo,
            invoice_number=new_num,
            doc_tipo=doc_tipo,
            doc_nro=doc_nro,
            amount=order['total_amount'],
            env=env,
            concept=concept
        )
        
        formatted_invoice_number = f"{pto_vta:04d}-{new_num:08d}"
        database.save_order_afip_details(order['order_id'], formatted_invoice_number, cae, cae_exp)
        
        order['invoice_number'] = formatted_invoice_number
        order['afip_cae'] = cae
        order['afip_cae_exp'] = cae_exp
        order['cbte_tipo'] = actual_cbte_tipo
        
        # Regenerate reportlab invoice PDF with real AFIP values
        from src.utils.invoice_gen import generate_invoice_pdf
        pdf_path = generate_invoice_pdf(order)
        
        meli_uploaded = False
        meli_msg = ""
        if order.get('source_platform') == 'MERCADOLIBRE':
            from src import meli_api
            meli_uploaded, meli_msg = meli_api.upload_invoice_to_meli(order['order_id'], pdf_path)
        
        return {
            "success": True,
            "invoice_number": formatted_invoice_number,
            "cae": cae,
            "cae_exp": cae_exp,
            "mode": "real",
            "meli_uploaded": meli_uploaded,
            "meli_msg": meli_msg
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def lookup_cuit(target_cuit: str, env: str = None):
    """
    Queries AFIP's official PersonaServiceA5 using the merchant's token and sign
    to retrieve Razón Social and Address for a given CUIT.
    """
    afip_enabled = database.get_setting('afip_enabled', '0') == '1'
    cuit_raw = database.get_setting('afip_cuit', '')
    cuit = cuit_raw.replace("-", "").strip()
    if env is None:
        env = database.get_setting('afip_environment', 'homologacion')
    
    cert_path = "backend/data/afip/arca.crt"
    key_path = "backend/data/afip/arca.key"
    has_credentials = os.path.exists(cert_path) and os.path.exists(key_path)
    
    clean_target = target_cuit.replace("-", "").strip()
    
    # If mock/demo mode or no credentials:
    if not afip_enabled or not has_credentials:
        # Return nice simulated values for testing
        return {
            "success": True,
            "razon_social": "HIDROPONIA ROSARIO S.R.L. (MOCK)",
            "direccion": "Av. del Libertador 1200, CABA (MOCK)",
            "cuit": clean_target,
            "mode": "mock"
        }
        
    try:
        # WSAA Auth with service ws_sr_constancia_inscripcion
        token, sign = get_wsaa_token(cuit, cert_path, key_path, env, service="ws_sr_constancia_inscripcion")
        
        # Call PersonaServiceA5 with correct namespace and cuitRepresentada
        soap_body = f"""<ns:getPersona xmlns:ns="http://a5.soap.ws.server.puc.sr/">
          <token>{token}</token>
          <sign>{sign}</sign>
          <cuitRepresentada>{cuit}</cuitRepresentada>
          <idPersona>{clean_target}</idPersona>
        </ns:getPersona>"""
        
        url = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5" if env == "homologacion" else "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5"
        
        soap_request = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    {soap_body}
  </soap:Body>
</soap:Envelope>"""

        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": '""',
            "Connection": "close"
        }
        
        res = get_session().post(url, data=soap_request, headers=headers, timeout=30.0)
        if res.status_code != 200:
            # Try to extract the error description from the SOAP Fault if status code is 500
            try:
                err_root = ET.fromstring(res.text)
                faultstring = err_root.find(".//faultstring")
                if faultstring is not None:
                    raise Exception(faultstring.text)
            except Exception:
                pass
            raise Exception(f"Error al consultar padrón (HTTP {res.status_code})")
            
        root = ET.fromstring(res.text)
        
        # Try with expected namespace first
        persona_return = root.find(".//{http://a5.soap.ws.server.puc.sr/}personaReturn")
        
        # Fallback: search for any element ending with 'personaReturn' (namespace-agnostic)
        if persona_return is None:
            for item in root.iter():
                if item.tag.endswith("personaReturn") or item.tag.endswith("getPersonaReturn"):
                    persona_return = item
                    break
        
        if persona_return is None:
            # Log raw response for debugging
            import logging
            logging.error(f"AFIP PersonaService raw response: {res.text[:2000]}")
            raise Exception(f"No se encontró información en la respuesta de AFIP. Respuesta: {res.text[:500]}")
            
        # Helper: find element by local name (namespace-agnostic)
        def find_by_local(parent, local_name):
            for el in parent.iter():
                tag = el.tag
                # Strip namespace: {http://...}localName -> localName
                if '}' in tag:
                    tag = tag.split('}', 1)[1]
                if tag == local_name:
                    return el
            return None
        
        error_node = find_by_local(persona_return, "errorConstancia")
        if error_node is not None:
            err_msg_node = find_by_local(error_node, "descripcionError")
            if err_msg_node is not None:
                raise Exception(err_msg_node.text)
                
        razon_social = ""
        dg = find_by_local(persona_return, "datosGenerales")
        if dg is not None:
            denominacion_node = find_by_local(dg, "denominacion")
            if denominacion_node is not None:
                razon_social = denominacion_node.text
            else:
                nombre_node = find_by_local(dg, "nombre")
                apellido_node = find_by_local(dg, "apellido")
                if nombre_node is not None and apellido_node is not None:
                    razon_social = f"{apellido_node.text} {nombre_node.text}"
                    
        direccion = ""
        df = find_by_local(persona_return, "domicilioFiscal")
        if df is not None:
            dir_node = find_by_local(df, "direccion")
            localidad_node = find_by_local(df, "localidad")
            provincia_node = find_by_local(df, "descripcionProvincia")
            
            parts = []
            if dir_node is not None and dir_node.text:
                parts.append(dir_node.text)
            if localidad_node is not None and localidad_node.text:
                parts.append(localidad_node.text)
            if provincia_node is not None and provincia_node.text:
                parts.append(provincia_node.text)
            direccion = ", ".join(parts)
            
        if not razon_social:
            raise Exception("No se encontró la razón social para este CUIT en el padrón de AFIP")
        
        # Extract fecha de inicio de actividades (Standard format: YYYY-MM-DD or YYYYMM)
        fecha_inicio = ""
        if dg is not None:
            fi_node = find_by_local(dg, "fechaInscripcion")
            if fi_node is not None and fi_node.text:
                fecha_inicio = fi_node.text
                if len(fecha_inicio) == 10 and fecha_inicio[4] == '-':
                    # YYYY-MM-DD -> DD/MM/YYYY
                    fecha_inicio = f"{fecha_inicio[8:10]}/{fecha_inicio[5:7]}/{fecha_inicio[0:4]}"
        
        # Extract IVA condition and IIBB from impuestos
        iva_condition = ""
        iibb = ""
        
        # Map AFIP impuesto IDs to IVA condition names
        iva_impuesto_map = {
            "30": "Responsable Inscripto",      # IVA
            "32": "Exento",                      # IVA Exento
            "33": "No Responsable",              # No alcanzado
            "20": "Responsable Monotributo",     # Monotributo
        }
        
        # Check datosRegimenGeneral for impuestos
        drg = find_by_local(persona_return, "datosRegimenGeneral")
        if drg is not None:
            for imp in drg.iter():
                tag = imp.tag
                if '}' in tag:
                    tag = tag.split('}', 1)[1]
                if tag == "impuesto":
                    id_node = find_by_local(imp, "idImpuesto")
                    if id_node is not None and id_node.text:
                        imp_id = id_node.text
                        if imp_id in iva_impuesto_map and not iva_condition:
                            iva_condition = iva_impuesto_map[imp_id]
                        # IIBB: impuesto 5900 = Convenio Multilateral, 5901-5924 = IIBB provincial
                        if imp_id == "5900" or (imp_id.startswith("59") and len(imp_id) == 4):
                            desc_node = find_by_local(imp, "descripcionImpuesto")
                            if desc_node is not None:
                                iibb = clean_target  # Typically IIBB number = CUIT
        
        # Check datosMonotributo for monotributo category and fallback start date
        categoria_monotributo = ""
        monotributo_max = ""
        dm = find_by_local(persona_return, "datosMonotributo")
        if dm is not None:
            if not iva_condition:
                iva_condition = "Responsable Monotributo"
                
            # Fallback for fecha de inicio: check impuesto periodo if fecha_inicio is empty
            if not fecha_inicio:
                imp_node = find_by_local(dm, "impuesto")
                if imp_node is not None:
                    per_node = find_by_local(imp_node, "periodo")
                    if per_node is not None and per_node.text:
                        # Format "YYYYMM" -> "01/MM/YYYY"
                        periodo = per_node.text.strip()
                        if len(periodo) == 6:
                            fecha_inicio = f"01/{periodo[4:6]}/{periodo[0:4]}"
                            
            cat_node = find_by_local(dm, "categoriaMonotributo")
            if cat_node is not None:
                id_cat = find_by_local(cat_node, "idCategoria")
                desc_cat = find_by_local(cat_node, "descripcionCategoria")
                if id_cat is not None and id_cat.text:
                    categoria_monotributo = id_cat.text
                if desc_cat is not None and desc_cat.text:
                    categoria_monotributo = desc_cat.text
            
            # Monotributo category max invoice amounts (2024 values)
            monotributo_topes = {
                "A": "$2.108.288,01", "B": "$3.133.941,63", "C": "$4.387.518,23",
                "D": "$5.449.094,55", "E": "$6.416.528,72", "F": "$8.020.660,90",
                "G": "$9.624.793,05", "H": "$11.916.410,45", "I": "$13.337.213,56",
                "J": "$15.285.088,04", "K": "$16.957.968,71"
            }
            cat_letter = categoria_monotributo.strip().upper()[-1:] if categoria_monotributo else ""
            monotributo_max = monotributo_topes.get(cat_letter, "")
        
        # If no IIBB found, DO NOT default to CUIT if it might overwrite user input.
        # Just leave it empty so the frontend preserves the user's manual input.
            
        return {
            "success": True,
            "razon_social": razon_social,
            "direccion": direccion,
            "cuit": clean_target,
            "iibb": iibb,
            "iva_condition": iva_condition,
            "fecha_inicio": fecha_inicio,
            "categoria_monotributo": categoria_monotributo,
            "monotributo_max_factura": monotributo_max,
            "mode": "real"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def consult_invoice(token: str, sign: str, cuit: str, pto_vta: int, cbte_tipo: int, cbte_nro: int, env: str):
    """
    Queries invoice details from AFIP WSFE via FECompConsultar.
    Supports local fallback if AFIP/ARCA WS credentials are not configured.
    """
    afip_enabled = database.get_setting('afip_enabled', '0') == '1'
    cuit_raw = database.get_setting('afip_cuit', '')
    cuit_clean = cuit_raw.replace("-", "").strip()
    cert_path = "backend/data/afip/arca.crt"
    key_path = "backend/data/afip/arca.key"
    has_credentials = os.path.exists(cert_path) and os.path.exists(key_path)

    if not afip_enabled or not has_credentials:
        # Mock mode fallback for local test
        import random
        return {
            "success": True,
            "order_id": int(f"{pto_vta}{cbte_tipo}{cbte_nro}"),
            "date_created": datetime.now().isoformat(),
            "buyer": {
                "id": 99999999,
                "nickname": "CONSUMIDOR_MOCK",
                "name": f"Consumidor Final Mock {cbte_nro}",
                "document_type": "DNI",
                "document_number": "99999999",
                "address": "Av. Siempreviva 742 (Mock)"
            },
            "total_amount": float(1250 * cbte_nro),
            "invoice_number": f"{pto_vta:04d}-{cbte_nro:08d}",
            "afip_cae": f"987654321098{cbte_nro}",
            "afip_cae_exp": (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        }

    body = f"""<FECompConsultar xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>{token}</Token>
        <Sign>{sign}</Sign>
        <Cuit>{cuit_clean}</Cuit>
      </Auth>
      <FeCompConsReq>
        <CbteTipo>{cbte_tipo}</CbteTipo>
        <CbteNro>{cbte_nro}</CbteNro>
        <PtoVta>{pto_vta}</PtoVta>
      </FeCompConsReq>
    </FECompConsultar>"""
    
    root = call_wsfe("FECompConsultar", body, env)
    
    result_node = root.find(".//{http://ar.gov.afip.dif.FEV1/}ResultGet")
    if result_node is not None:
        def get_text(tag):
            node = result_node.find(f"{{http://ar.gov.afip.dif.FEV1/}}{tag}")
            return node.text if node is not None else ""
            
        doc_tipo = int(get_text("DocTipo") or 99)
        doc_nro = get_text("DocNro") or ""
        cbte_fch = get_text("CbteFch") or ""
        imp_total = float(get_text("ImpTotal") or 0)
        cae = get_text("CodAutorizacion") or ""
        cae_vto = get_text("FchVto") or ""
        
        # Parse date from YYYYMMDD to YYYY-MM-DD
        date_formatted = ""
        if len(cbte_fch) == 8:
            date_formatted = f"{cbte_fch[:4]}-{cbte_fch[4:6]}-{cbte_fch[6:]}T12:00:00.000-03:00"
            
        cae_vto_formatted = ""
        if len(cae_vto) == 8:
            cae_vto_formatted = f"{cae_vto[:4]}-{cae_vto[4:6]}-{cae_vto[6:]}"
            
        # Try to lookup customer CUIT to get name/address or use defaults
        buyer_name = "Consumidor Final"
        buyer_address = ""
        doc_type_str = "DNI"
        if doc_tipo == 80:
            doc_type_str = "CUIT"
            try:
                afip_info = lookup_cuit(doc_nro)
                if afip_info.get("success"):
                    buyer_name = afip_info.get("razon_social", buyer_name)
                    buyer_address = afip_info.get("direccion", buyer_address)
            except Exception:
                pass
        
        return {
            "success": True,
            "order_id": int(f"{pto_vta}{cbte_tipo}{cbte_nro}"),
            "date_created": date_formatted or datetime.now().isoformat(),
            "buyer": {
                "id": int(doc_nro) if doc_nro.isdigit() else random.randint(100000, 999999),
                "nickname": buyer_name.replace(" ", "_").upper()[:15],
                "name": buyer_name,
                "document_type": doc_type_str,
                "document_number": doc_nro,
                "address": buyer_address
            },
            "total_amount": imp_total,
            "invoice_number": f"{pto_vta:04d}-{cbte_nro:08d}",
            "afip_cae": cae,
            "afip_cae_exp": cae_vto_formatted
        }
        
    error_nodes = root.findall(".//{http://ar.gov.afip.dif.FEV1/}Err")
    if error_nodes:
        err_msg = ", ".join([f"{e.find('{http://ar.gov.afip.dif.FEV1/}Msg').text}" for e in error_nodes if e.find('{http://ar.gov.afip.dif.FEV1/}Msg') is not None])
        raise Exception(err_msg)
        
    raise Exception("No se pudo consultar el comprobante en AFIP")

