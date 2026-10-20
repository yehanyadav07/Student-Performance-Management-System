# Student-Performance-Management-System
Student Performance Analysis and Result Management System using MySQL to manage student records, subject marks, grades, and academic performance reports.

# Student Performance Analysis and Result Management System

## Project Overview

The Student Performance Analysis and Result Management System is a DBMS project developed to manage student information, subject details, examination marks, grades, and academic performance reports efficiently using MySQL.

## Problem Statement

To develop a Student Performance Analysis and Result Management System that manages student records, subject marks, grades, and performance reports using a database system.

## Objectives

* Store and manage student information.
* Maintain subject details and examination marks.
* Calculate total marks and percentage.
* Determine student grades based on performance.
* Identify toppers and analyze subject-wise performance.
* Generate academic performance reports using SQL queries.

## Modules

1. **Student Management:** Add, update, view, and delete student records.
2. **Subject Management:** Maintain subject names and maximum marks.
3. **Marks Management:** Record and manage students' marks.
4. **Result Management:** Calculate totals, percentages, and grades.
5. **Performance Analysis:** Identify toppers and calculate subject-wise averages.

## Technologies Used

* **Database:** MySQL
* **Database Tool:** MySQL Workbench
* **Query Language:** SQL

## Database Tables

* `Student` — Stores student details.
* `Subject` — Stores subject information.
* `Marks` — Stores marks obtained by students in different subjects.

Additional tables may be introduced as the project develops.

## Key DBMS Concepts

* Primary keys and foreign keys
* Table relationships
* Data integrity constraints
* CRUD operations (Create, Read, Update, Delete)
* SQL joins and aggregate functions
* Grouping, sorting, and filtering records

## How to Run the Project

1. Install MySQL Server and MySQL Workbench.
2. Clone or download this repository.
3. Open the SQL script from the `database` folder in MySQL Workbench.
4. Execute the SQL script to create the database and tables.
5. Insert sample student, subject, and marks records.
6. Run the SQL queries to view results and analyze performance.

## Project Structure

```text
Student-Performance-Management-System/
├── database/
│   └── student_performance.sql
├── diagrams/
│   └── er_diagram.png
├── screenshots/
├── report/
│   └── project_report.pdf
└── README.md
```

## Expected Outcome

The system will provide an organized way to store student academic records, calculate results, and analyze student performance through SQL queries.

## Future Enhancements

* Web-based dashboard for teachers and administrators.
* Attendance management.
* Student login and result viewing.
* Graphical performance reports.

## Author

Student DBMS Academic Project

## License

This project is intended for educational and academic purposes.
