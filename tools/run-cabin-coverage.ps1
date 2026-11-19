param(
  [string]$TempDir = '.covall',
  [string]$ReportFile = 'coverage-report.txt'
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $TempDir | Out-Null
$env:NODE_V8_COVERAGE = (Join-Path $root $TempDir)

$tests = @(
  'cabin.test.js',
  'cabin-packs.test.js',
  'cabin-official.test.js',
  'cabin-3e-rules.test.js',
  'cabin-specials.test.js',
  'cabin-setup.test.js',
  'cabin-rule-fixes.test.js',
  'cabin-all-scenarios.test.js',
  'cabin-scenario-acceptance.test.js',
  'cabin-scenario-playthrough.test.js',
  'cabin-mechanic-3e.test.js',
  'cabin-full-coverage.test.js',
  'cabin-security.test.js'
)

foreach ($test in $tests) {
  $out = & node (Join-Path 'tests' $test) 2>&1
  if ($LASTEXITCODE -ne 0) {
    $out | Select-Object -Last 12
    throw "测试失败：$test"
  }
  Write-Host "$test -> $($out | Select-Object -Last 1)"
}

# V8 对 vm.runInThisContext 记录的是相对/反斜杠 URL；统一成 c8 能识别的绝对 file URL。
& node -e "const fs=require('fs');for(const f of fs.readdirSync('$TempDir')){const p='$TempDir/'+f;const j=JSON.parse(fs.readFileSync(p));j.result.forEach(r=>{const b=r.url.split(/[\\/]/).pop();if(b==='cabin.js'||b==='cabin-packs.js')r.url='file:///'+process.cwd().replace(/\\\\/g,'/')+'/js/games/'+b;});fs.writeFileSync(p,JSON.stringify(j));}"

& npx --yes c8 report --reporter=text-summary --temp-directory=$TempDir
Start-Sleep -Milliseconds 500
& npx --yes c8 report --reporter=text --temp-directory=$TempDir 2>&1 | Out-File -LiteralPath $ReportFile -Encoding utf8
Write-Host "详细报告：$ReportFile"
