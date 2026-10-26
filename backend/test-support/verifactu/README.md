# Official VERI*FACTU schemas used in tests

Downloaded on 2026-10-21 from AEAT's published version 1.0 service definition:

https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/

Files: SuministroInformacion.xsd, SuministroLR.xsd, RespuestaSuministro.xsd and SistemaFacturacion.wsdl. Original namespaces and content are preserved. The XML Signature schema is from https://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd and retains its W3C copyright and license notice.

validate.ps1 preloads the local schemas with network resolution disabled and validates the SOAP body of each XML in its input directory. It is invoked by verifactu.test.js on Windows. The Node tests also validate XML syntax on every platform and check all three hash vectors from AEAT's 0.1.2 hash specification.