-- ============================================
-- TRIGGERS, ASSERTIONS & STORED PROCEDURES
-- ============================================

USE placement_management;

-- ============================================
-- 1️⃣ TRIGGERS
-- ============================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS validate_student_cgpa_insert;
DROP TRIGGER IF EXISTS prevent_duplicate_reg_no;
DROP TRIGGER IF EXISTS auto_update_placement_status;
DROP TRIGGER IF EXISTS validate_job_role_package;
DROP TRIGGER IF EXISTS audit_student_insert;
DROP TRIGGER IF EXISTS audit_student_delete;

-- Trigger: Prevent adding student with invalid CGPA (0-10)
DELIMITER //
CREATE TRIGGER validate_student_cgpa_insert
BEFORE INSERT ON Student
FOR EACH ROW
BEGIN
  IF NEW.cgpa < 0 OR NEW.cgpa > 10 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'CGPA must be between 0 and 10';
  END IF;
END //
DELIMITER ;

-- Trigger: Prevent duplicate student registration numbers
DELIMITER //
CREATE TRIGGER prevent_duplicate_reg_no
BEFORE INSERT ON Student
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM Student WHERE roll_no = NEW.roll_no AND student_id != NEW.student_id) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Registration number already exists';
  END IF;
END //
DELIMITER ;

-- Trigger: Auto-update placement status when a student is selected
DELIMITER //
CREATE TRIGGER auto_update_placement_status
AFTER INSERT ON Placement
FOR EACH ROW
BEGIN
  UPDATE Applications
  SET status = 'Selected'
  WHERE student_id = NEW.student_id AND jobrole_id = NEW.jobrole_id;
END //
DELIMITER ;

-- Trigger: Prevent job role with invalid package (must be > 0)
DELIMITER //
CREATE TRIGGER validate_job_role_package
BEFORE INSERT ON Job_Roles
FOR EACH ROW
BEGIN
  IF NEW.package_lpa <= 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Package must be greater than 0';
  END IF;
END //
DELIMITER ;

-- Trigger: Log student additions to an audit table
CREATE TABLE IF NOT EXISTS Student_Audit (
  audit_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  action VARCHAR(50),
  action_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DELIMITER //
CREATE TRIGGER audit_student_insert
AFTER INSERT ON Student
FOR EACH ROW
BEGIN
  INSERT INTO Student_Audit (student_id, action) VALUES (NEW.student_id, 'INSERT');
END //
DELIMITER ;

DELIMITER //
CREATE TRIGGER audit_student_delete
AFTER DELETE ON Student
FOR EACH ROW
BEGIN
  INSERT INTO Student_Audit (student_id, action) VALUES (OLD.student_id, 'DELETE');
END //
DELIMITER ;

-- ============================================
-- 2️⃣ STORED PROCEDURES
-- ============================================

-- Drop existing procedures
DROP PROCEDURE IF EXISTS GetEligibleStudents;
DROP PROCEDURE IF EXISTS AddStudent;
DROP PROCEDURE IF EXISTS GetPlacementStats;
DROP PROCEDURE IF EXISTS ApplyForJob;
DROP PROCEDURE IF EXISTS GetTopCompaniesByPackage;
DROP PROCEDURE IF EXISTS RecordPlacement;

-- Procedure: Get eligible students for a job role
DELIMITER //
CREATE PROCEDURE GetEligibleStudents(IN p_jobrole_id INT)
BEGIN
  SELECT 
    s.student_id,
    s.student_name,
    s.cgpa,
    d.dept_name,
    jr.role_title,
    c.company_name
  FROM Student s
  JOIN Department d ON s.department_id = d.dept_id
  JOIN Job_Roles jr ON jr.jobrole_id = p_jobrole_id
  JOIN Company c ON jr.company_id = c.company_id
  WHERE s.cgpa >= 0
  ORDER BY s.cgpa DESC;
END //
DELIMITER ;

-- Procedure: Add a new student (with validation)
DELIMITER //
CREATE PROCEDURE AddStudent(
  IN p_name VARCHAR(100),
  IN p_reg_no VARCHAR(20),
  IN p_dept_id INT,
  IN p_cgpa DECIMAL(3,2),
  IN p_email VARCHAR(100),
  IN p_phone VARCHAR(15),
  OUT p_student_id INT,
  OUT p_message VARCHAR(255)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    SET p_message = 'Error: Student could not be added';
    SET p_student_id = NULL;
  END;
  
  INSERT INTO Student (student_name, roll_no, department_id, cgpa, email, phone)
  VALUES (p_name, p_reg_no, p_dept_id, p_cgpa, p_email, p_phone);
  
  SET p_student_id = LAST_INSERT_ID();
  SET p_message = CONCAT('Student added with ID: ', p_student_id);
END //
DELIMITER ;

-- Procedure: Get placement statistics by department
DELIMITER //
CREATE PROCEDURE GetPlacementStats()
BEGIN
  SELECT 
    d.dept_name,
    COUNT(DISTINCT s.student_id) AS total_students,
    COUNT(DISTINCT p.placement_id) AS placed_students,
    ROUND(COUNT(DISTINCT p.placement_id) * 100.0 / NULLIF(COUNT(DISTINCT s.student_id), 0), 2) AS placement_percentage,
    ROUND(AVG(jr.package_lpa), 2) AS avg_package
  FROM Department d
  LEFT JOIN Student s ON d.dept_id = s.department_id
  LEFT JOIN Placement p ON s.student_id = p.student_id
  LEFT JOIN Job_Roles jr ON p.jobrole_id = jr.jobrole_id
  GROUP BY d.dept_id, d.dept_name
  ORDER BY placement_percentage DESC;
END //
DELIMITER ;

-- Procedure: Apply for a job role
DELIMITER //
CREATE PROCEDURE ApplyForJob(
  IN p_student_id INT,
  IN p_jobrole_id INT,
  OUT p_application_id INT,
  OUT p_message VARCHAR(255)
)
BEGIN
  DECLARE v_already_applied INT;
  
  SELECT COUNT(*) INTO v_already_applied
  FROM Applications
  WHERE student_id = p_student_id AND jobrole_id = p_jobrole_id;
  
  IF v_already_applied > 0 THEN
    SET p_message = 'Student already applied for this job role';
    SET p_application_id = NULL;
  ELSE
    INSERT INTO Applications (student_id, jobrole_id, status)
    VALUES (p_student_id, p_jobrole_id, 'Applied');
    
    SET p_application_id = LAST_INSERT_ID();
    SET p_message = CONCAT('Application submitted with ID: ', p_application_id);
  END IF;
END //
DELIMITER ;

-- Procedure: Get top companies by average package
DELIMITER //
CREATE PROCEDURE GetTopCompaniesByPackage()
BEGIN
  SELECT 
    c.company_id,
    c.company_name,
    c.location,
    COUNT(DISTINCT p.placement_id) AS placements_offered,
    ROUND(AVG(jr.package_lpa), 2) AS avg_package
  FROM Company c
  LEFT JOIN Job_Roles jr ON c.company_id = jr.company_id
  LEFT JOIN Placement p ON jr.jobrole_id = p.jobrole_id
  GROUP BY c.company_id, c.company_name, c.location
  ORDER BY avg_package DESC;
END //
DELIMITER ;

-- Procedure: Record a placement
DELIMITER //
CREATE PROCEDURE RecordPlacement(
  IN p_student_id INT,
  IN p_jobrole_id INT,
  IN p_status VARCHAR(50),
  OUT p_placement_id INT,
  OUT p_message VARCHAR(255)
)
BEGIN
  DECLARE v_company_id INT;
  
  SELECT company_id INTO v_company_id
  FROM Job_Roles
  WHERE jobrole_id = p_jobrole_id;
  
  IF v_company_id IS NULL THEN
    SET p_message = 'Job role not found';
    SET p_placement_id = NULL;
  ELSE
    INSERT INTO Placement (student_id, jobrole_id, status)
    VALUES (p_student_id, p_jobrole_id, p_status);
    
    SET p_placement_id = LAST_INSERT_ID();
    SET p_message = CONCAT('Placement recorded with ID: ', p_placement_id);
  END IF;
END //
DELIMITER ;

-- ============================================
-- 3️⃣ VIEWS
-- ============================================

-- Drop existing views
DROP VIEW IF EXISTS Placement_Ready_Students;
DROP VIEW IF EXISTS Active_Job_Openings;
DROP VIEW IF EXISTS Student_Placement_Summary;

-- View: Students eligible for placement
CREATE VIEW Placement_Ready_Students AS
SELECT 
  s.student_id,
  s.student_name,
  s.cgpa,
  d.dept_name,
  s.email,
  s.phone
FROM Student s
JOIN Department d ON s.department_id = d.dept_id
WHERE s.cgpa >= 6.5;

-- View: Active job openings
CREATE VIEW Active_Job_Openings AS
SELECT 
  jr.jobrole_id,
  jr.role_title,
  c.company_name,
  c.location,
  jr.package_lpa,
  COUNT(DISTINCT a.application_id) AS applications_count
FROM Job_Roles jr
JOIN Company c ON jr.company_id = c.company_id
LEFT JOIN Applications a ON jr.jobrole_id = a.jobrole_id
GROUP BY jr.jobrole_id, jr.role_title, c.company_name, c.location, jr.package_lpa;

-- View: Student placement summary
CREATE VIEW Student_Placement_Summary AS
SELECT 
  s.student_id,
  s.student_name,
  d.dept_name,
  s.cgpa,
  c.company_name,
  jr.role_title,
  jr.package_lpa,
  p.status
FROM Student s
LEFT JOIN Department d ON s.department_id = d.dept_id
LEFT JOIN Placement p ON s.student_id = p.student_id
LEFT JOIN Job_Roles jr ON p.jobrole_id = jr.jobrole_id
LEFT JOIN Company c ON jr.company_id = c.company_id;
