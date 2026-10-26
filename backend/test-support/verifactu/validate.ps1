param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$schemaRoot = $PSScriptRoot
$schemaSet = [System.Xml.Schema.XmlSchemaSet]::new()
$schemaSet.XmlResolver = $null
foreach ($name in @('xmldsig-core-schema.xsd','SuministroInformacion.xsd','SuministroLR.xsd')) {
 $readerSettings = [System.Xml.XmlReaderSettings]::new()
 $readerSettings.DtdProcessing = [System.Xml.DtdProcessing]::Parse
 $readerSettings.XmlResolver = $null
 $reader = [System.Xml.XmlReader]::Create((Join-Path $schemaRoot $name),$readerSettings)
 try { $schema = [System.Xml.Schema.XmlSchema]::Read($reader,$null); [void]$schemaSet.Add($schema) } finally { $reader.Close() }
}
$schemaSet.Compile()
foreach ($file in Get-ChildItem -LiteralPath $Directory -Filter '*.xml') {
 $document = [System.Xml.XmlDocument]::new()
 $document.XmlResolver = $null
 $document.Load($file.FullName)
 $node = $document.DocumentElement.ChildNodes | Where-Object { $_.LocalName -eq 'Body' } | ForEach-Object { $_.FirstChild }
 if ($null -eq $node) { throw 'Missing SOAP body' }
 $settings = [System.Xml.XmlReaderSettings]::new()
 $settings.ValidationType = [System.Xml.ValidationType]::Schema
 $settings.Schemas.Add($schemaSet)
 $settings.add_ValidationEventHandler({ param($sender,$eventArgs) throw $eventArgs.Exception })
 $reader = [System.Xml.XmlReader]::Create([System.Xml.XmlNodeReader]::new($node),$settings)
 try { while ($reader.Read()) {} } finally { $reader.Close() }
 Write-Output ('Validated: '+$file.Name)
}