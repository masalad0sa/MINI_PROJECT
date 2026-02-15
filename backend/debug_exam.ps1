$json = Get-Content "temp_login.json" -Raw
$loginRes = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -Body $json -ContentType "application/json"
$token = $loginRes.token
Write-Host "Token obtained."
try {
    $examRes = Invoke-RestMethod -Uri "http://localhost:5000/api/exam" -Method Get -Headers @{Authorization=("Bearer " + $token)}
    Write-Host "Success:"
    Write-Output $examRes
} catch {
    Write-Host "Error Status: $($_.Exception.Response.StatusCode)"
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Output "Error Body: $($reader.ReadToEnd())"
}
