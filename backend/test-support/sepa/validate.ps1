param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$schemaSet = [System.Xml.Schema.XmlSchemaSet]::new()
$schemaSet.XmlResolver = $null
foreach ($schemaName in @('pain.001.001.09.xsd','pain.008.001.08.xsd')) {
 $schemaReader = [System.Xml.XmlReader]::Create((Join-Path $PSScriptRoot $schemaName))
 try {[void]$schemaSet.Add([System.Xml.Schema.XmlSchema]::Read($schemaReader,$null))} finally {$schemaReader.Close()}
}
$schemaSet.Compile()
foreach ($file in Get-ChildItem -LiteralPath $Directory -Filter '*.xml') {
 $settings = [System.Xml.XmlReaderSettings]::new()
 $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
 $settings.XmlResolver = $null
 $settings.ValidationType = [System.Xml.ValidationType]::Schema
 [void]$settings.Schemas.Add($schemaSet)
 $settings.add_ValidationEventHandler({param($sender,$eventArgs) throw $eventArgs.Exception})
 $reader = [System.Xml.XmlReader]::Create($file.FullName,$settings)
 try {while ($reader.Read()) {}} finally {$reader.Close()}
 Write-Output ('Validated: '+$file.Name)
}
