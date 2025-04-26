# API Documentation Table-Reservations

## Authentication

### 1. Login
- **Method**: POST
- **URL**: `http://localhost:3000/api/auth/login`
- **Body**:
```json
{
  "email": "admin@gmail.com",
  "password": "123123"
}
```

### 2. Register
- **Method**: POST
- **URL**: `http://localhost:3000/api/auth/register`
- **Body**:
```json
{
  "name": "admin",
  "email": "admin@gmail.com",
  "phone": "08123123",
  "password": "123123"
}
```

### 3. Logout
- **Method**: POST
- **URL**: `http://localhost:3000/api/auth/logout`

---

## Tables

### 4. Get All Tables
- **Method**: GET
- **URL**: `http://localhost:3000/api/tables`

### 5. Get Available Tables
- **Method**: GET
- **URL**: `http://localhost:3000/api/tables/available`

### 6. Get Table by ID
- **Method**: GET
- **URL**: `http://localhost:3000/api/tables/{id}`

### 7. Create Table
- **Method**: POST
- **URL**: `http://localhost:3000/api/tables`
- **Body**:
```json
{
  "table_number": 8,
  "capacity": 2
}
```

### 8. Update Table Status
- **Method**: PATCH
- **URL**: `http://localhost:3000/api/tables/{id}/status`
- **Body**:
```json
{
  "status": "available"
}
```

### 9. Delete Table
- **Method**: DELETE
- **URL**: `http://localhost:3000/api/tables/{id}`

---

## Reservations

### 10. Create Reservation
- **Method**: POST
- **URL**: `http://localhost:3000/api/reservations`
- **Body**:
```json
{
  "table_id": 9,
  "reservation_date": "2025-04-26",
  "reservation_time": "12:26:00",
  "duration": 60,
  "guest_count": 2,
  "notes": "Me time"
}
```

### 11. Get All Reservations
- **Method**: GET
- **URL**: `http://localhost:3000/api/reservations`

### 12. Get User Reservations
- **Method**: GET
- **URL**: `http://localhost:3000/api/reservations/user`

### 13. Get Reservation by ID
- **Method**: GET
- **URL**: `http://localhost:3000/api/reservations/{id}`

### 14. Update Reservation Status
- **Method**: PATCH
- **URL**: `http://localhost:3000/api/reservations/{id}/status`

### 15. Delete Reservation
- **Method**: DELETE
- **URL**: `http://localhost:3000/api/reservations/{id}`

### 16. Check Table Availability
- **Method**: POST
- **URL**: `http://localhost:3000/api/reservations/check-availability`
- **Body**:
```json
{
  "table_id": 7,
  "reservation_date": "2025-04-25",
  "reservation_time": "18:00:00",
  "duration": 120,
  "reservation_id": null
}
```

