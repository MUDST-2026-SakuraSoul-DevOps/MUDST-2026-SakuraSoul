package com.sakurasoul.apartment.common;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * แปลง exception เป็น ProblemDetail ตาม RFC 9457 ให้หมด
 * คนเรียก API จะได้เจอรูปแบบเดียวกันทุกกรณี ไม่ต้องเดาว่า error หน้าตาแบบไหน
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail handleNotFound(NotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /** คำขอถูกรูปแบบแต่ชนกับข้อมูลที่มีอยู่ ข้อความถูกเขียนมาให้ผู้ใช้อ่านแล้ว ส่งต่อทั้งประโยค */
    @ExceptionHandler(ConflictException.class)
    ProblemDetail handleConflict(ConflictException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    /** constraint ใน database เช่น เลขห้องซ้ำ ต้องออกมาเป็น 409 ไม่ใช่ 500 */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail handleConstraint(DataIntegrityViolationException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, constraintMessage(ex));
    }

    /**
     * ปกติสัญญาที่ทับกันจะโดนดักตั้งแต่ใน LeaseService แล้วได้ข้อความที่บอกได้ว่าไปชน
     * กับสัญญาของใคร ที่มาถึงตรงนี้ได้คือสองคำขอเข้ามาพร้อมกันจนเช็คผ่านทั้งคู่แล้วไปโดน
     * exclusion constraint ที่ database (เคส US-05-S2) ตอนนั้น transaction พังไปแล้ว
     * ย้อนไปอ่านว่าชนกับใบไหนไม่ได้ จึงบอกได้แค่ว่าชนเรื่องช่วงวันที่
     */
    private static String constraintMessage(DataIntegrityViolationException ex) {
        String cause = ex.getMostSpecificCause().getMessage();
        if (cause != null && cause.contains("lease_no_overlap")) {
            return "ช่วงวันที่ที่เลือกทับกับสัญญาที่ยังไม่สิ้นสุดของห้องนี้ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
        }
        return "ข้อมูลชนกับที่มีอยู่แล้วในระบบ";
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(e -> fields.putIfAbsent(e.getField(), e.getDefaultMessage()));
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
        problem.setProperty("fields", fields);
        return problem;
    }
}
