import pandas as pd

# Create DataFrame
data = {
    'Register Number': ['URK24CS7095', 'URK23CM4059'],
    'Student Name': ['GRACE', 'MANJULATHA'],
    'Committee': ['Dance', 'Singing'],
    'Hostel': ['Hostel A', 'Hostel B'],
    'Room': ['101', '202'],
    'Phone': ['9876543210', '9876543211'],
    'Department': ['ECE', 'CSE']
}

df = pd.DataFrame(data)

# Save to CSV
df.to_csv('student.csv', index=False)

print("CSV file created successfully!")
