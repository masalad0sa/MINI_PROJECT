$json = Get-Content "temp_login.json" -Raw
$loginRes = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -Body $json -ContentType "application/json"
$token = $loginRes.token
Write-Host "Token obtained."

$examData = @{
    title = "Test Exam"
    description = "Test Description"
    duration = 30
    passingScore = 50
    questions = @(
        @{
            questionText = "What is 2+2?"
            options = @("1", "2", "3", "4")
            correctAnswer = 3
        }
    )
    settings = @{
        webcamRequired = $true
        screenShareRequired = $true
        strictMode = $true
        browserLock = $true
    }
} | ConvertTo-Json -Depth 4

try {
    $res = Invoke-RestMethod -Uri "http://localhost:5000/api/exam" -Method Post -Body $examData -ContentType "application/json" -Headers @{Authorization=("Bearer " + $token)}
    Write-Host "Success:"
    Write-Output $res
} catch {
    Write-Host "Error Status: $($_.Exception.Response.StatusCode)"
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Output "Error Body: $($reader.ReadToEnd())"
}
