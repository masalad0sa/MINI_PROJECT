import requests
from bs4 import BeautifulSoup
import csv

# 1. Create and open a CSV file for writing
with open('exam_results.csv', mode='w', newline='', encoding='utf-8') as file:
    writer = csv.writer(file)
    
    # 2. Write the header row
    writer.writerow(['ID', 'Name', 'Result'])

    print("Starting data collection...")

    for i in range(8001, 8090):
        try:
            web = requests.get(f"https://ums.cvmu.ac.in/GenerateResultHTML/4815/520{i}.html")
            
            # Check if the page exists
            if web.status_code == 200:
                soup = BeautifulSoup(web.content, 'html.parser')
                
                result = soup.find('span', {'class': 'colum-left'})
                name_tags = soup.find_all('td')
                
                # Get the text data
                student_name = name_tags[8].text.strip()
                student_result = result.text.strip()
                
                # 3. Write the data to the file
                writer.writerow([i, student_name, student_result])
                print(f"Saved: {i} - {student_name}")
            else:
                print(f"Page {i} not found (Error {web.status_code})")

        except Exception as e:
            print(f"Error at ID {i}: {e}")
            writer.writerow([i, "Error", "Data Not Found"])

print("Done! Check for 'exam_results.csv' in your folder.")