package com.sakurasoul.apartment.common;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.MismatchedInputException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * แปลง exception เป็น ProblemDetail ตาม RFC 9457 ให้หมด
 * คนเรียก API จะได้เจอรูปแบบเดียวกันทุกกรณี ไม่ต้องเดาว่า error หน้าตาแบบไหน
 * <p>
 * สืบทอดจาก {@link ResponseEntityExceptionHandler} เพราะ error ที่ตัว framework
 * โยนเองก่อนจะถึงโค้ดของเรา เช่น JSON พัง, path variable ผิดชนิด, เรียกผิด method
 * (405), ส่ง content type ที่ไม่รองรับ (415) หรือลืม query param จะไม่ผ่าน
 * @ExceptionHandler ของเราเลย ถ้าไม่สืบทอด error กลุ่มนี้จะกลายเป็น error page
 * ตั้งต้นของ Spring Boot ซึ่งคนละรูปแบบกับ ProblemDetail ที่สัญญา API กำหนดไว้
 * ทางเลือกอีกทางคือเปิด spring.mvc.problemdetails.enabled แต่ทางนั้นจะตั้ง detail
 * เป็นข้อความอังกฤษของ framework ที่เอาไปโชว์ผู้ใช้ไม่ได้ การ override เองทำให้
 * เขียนข้อความไทยทับได้ทีละกรณี
 * <p>
 * handler ของ NotFound / IllegalArgument / DataIntegrityViolation ข้างล่างยังทำงาน
 * เหมือนเดิมทุกอย่าง เพราะ exception สามตัวนั้นไม่ได้อยู่ในรายการที่ superclass ดูแล
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail handleNotFound(NotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /** constraint ใน database เช่น เลขห้องซ้ำ ต้องออกมาเป็น 409 ไม่ใช่ 500 */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail handleConstraint(DataIntegrityViolationException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "ข้อมูลชนกับที่มีอยู่แล้วในระบบ");
    }

    /**
     * bean validation ไม่ผ่าน
     * <p>
     * ฟิลด์ fields เก็บไว้ครบเหมือนเดิมสำหรับคนที่อยากรู้ว่าผิดกี่ช่อง แต่ detail ต้อง
     * เป็นข้อความของช่องแรกที่ผิด ไม่ใช่ข้อความกลาง ๆ เพราะ frontend/src/api/client.ts
     * อ่านแค่ detail ตัวเดียวไปโชว์ใต้ฟอร์ม และ docs/api-contract-lease.md ระบุว่า
     * ข้อความที่เอาไปให้ผู้ใช้อ่านอยู่ที่ detail ถ้าปล่อยเป็นข้อความกลาง ๆ ผู้ใช้จะเห็นแค่
     * "ข้อมูลที่ส่งมาไม่ถูกต้อง" โดยไม่รู้ว่าช่องไหน
     */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldError> fieldErrors = ex.getBindingResult().getFieldErrors();

        Map<String, String> fields = new LinkedHashMap<>();
        fieldErrors.forEach(e -> fields.putIfAbsent(e.getField(), e.getDefaultMessage()));

        String detail = fieldErrors.isEmpty() ? null : fieldErrors.get(0).getDefaultMessage();
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status,
                detail != null ? detail : "ข้อมูลที่ส่งมาไม่ถูกต้อง");
        problem.setProperty("fields", fields);

        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    /**
     * body ที่ Jackson อ่านไม่ออก เช่น ส่ง "abc" มาในช่องที่เป็นตัวเลข หรือ JSON ไม่ครบวงเล็บ
     * <p>
     * ข้อความตั้งต้นของ Spring กรณีนี้เป็นอังกฤษและมีรายละเอียดภายในของ Jackson ปนมาด้วย
     * เอาไปโชว์ใต้ฟอร์มไม่ได้ จึงถอดชื่อช่องจาก path ของ Jackson มาประกอบข้อความไทยเอง
     */
    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, unreadableBodyDetail(ex));
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    /** ข้อความไทยที่บอกให้ผู้ใช้รู้ว่าต้องไปแก้ช่องไหน ถ้าบอกไม่ได้ค่อยตกไปที่ข้อความรวม */
    private static String unreadableBodyDetail(HttpMessageNotReadableException ex) {
        MismatchedInputException mismatch = findMismatchedInput(ex);
        if (mismatch == null) {
            return "ข้อมูลที่ส่งมาอ่านไม่ได้ ตรวจรูปแบบ JSON";
        }

        List<JacksonException.Reference> path = mismatch.getPath();
        if (path.isEmpty()) {
            return "ข้อมูลที่ส่งมาอ่านไม่ได้ ตรวจรูปแบบ JSON";
        }

        // เอาตัวท้ายสุดของ path เพราะมันคือช่องที่พังจริง ๆ ตัวหน้า ๆ เป็นแค่ object ที่ครอบอยู่
        String field = path.get(path.size() - 1).getPropertyName();
        if (field == null) {
            return "ข้อมูลที่ส่งมาอ่านไม่ได้ ตรวจรูปแบบ JSON";
        }

        return isNumeric(mismatch.getTargetType())
                ? "ช่อง " + field + " ต้องเป็นตัวเลข"
                : "ช่อง " + field + " มีรูปแบบไม่ถูกต้อง";
    }

    /**
     * Jackson ห่อ exception ซ้อนกันได้หลายชั้น ไล่ตาม cause ไปจนเจอชั้นที่มีข้อมูลว่า
     * ช่องไหนพัง ไม่ใช่ดูแค่ cause ชั้นแรกชั้นเดียว
     */
    private static MismatchedInputException findMismatchedInput(Throwable ex) {
        for (Throwable cause = ex.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof MismatchedInputException mismatch) {
                return mismatch;
            }
            if (cause == cause.getCause()) {
                break;
            }
        }
        return null;
    }

    /** ช่องที่เป็นตัวเลขได้ทั้ง BigDecimal, Integer และ primitive อย่าง int */
    private static boolean isNumeric(Class<?> targetType) {
        if (targetType == null) {
            return false;
        }
        if (Number.class.isAssignableFrom(targetType)) {
            return true;
        }
        return targetType == int.class || targetType == long.class || targetType == short.class
                || targetType == byte.class || targetType == double.class || targetType == float.class;
    }
}
