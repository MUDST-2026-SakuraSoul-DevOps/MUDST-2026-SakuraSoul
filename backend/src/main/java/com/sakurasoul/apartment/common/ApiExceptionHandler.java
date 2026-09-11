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
 * เขียนข้อความของเราเองทับได้ทีละกรณี
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
     * <p>
     * tenant_national_id_uk เป็นเรื่องเดียวกันคนละตาราง TenantService เช็คเลขบัตรซ้ำ
     * ไว้ก่อนแล้วก็จริง แต่สองคำขอที่เข้ามาพร้อมกันจะผ่านการเช็คทั้งคู่ ที่นี่จึงต้องตอบ
     * ข้อความเดียวกับที่ service โยน ไม่งั้นผู้ใช้สองคนที่เจอปัญหาเดียวกันจะเห็นคนละประโยค
     */
    private static String constraintMessage(DataIntegrityViolationException ex) {
        String cause = ex.getMostSpecificCause().getMessage();
        if (cause != null && cause.contains("lease_no_overlap")) {
            return "The dates you chose overlap an active lease for this unit. Please reload the page and try again";
        }
        if (cause != null && cause.contains("tenant_national_id_uk")) {
            return "A tenant with this national ID already exists";
        }
        return "This conflicts with data that already exists";
    }

    /**
     * bean validation ไม่ผ่าน
     * <p>
     * ฟิลด์ fields เก็บไว้ครบเหมือนเดิมสำหรับคนที่อยากรู้ว่าผิดกี่ช่อง แต่ detail ต้อง
     * เป็นข้อความของช่องแรกที่ผิด ไม่ใช่ข้อความกลาง ๆ เพราะ frontend/src/api/client.ts
     * อ่านแค่ detail ตัวเดียวไปโชว์ใต้ฟอร์ม และ docs/api-contract-lease.md ระบุว่า
     * ข้อความที่เอาไปให้ผู้ใช้อ่านอยู่ที่ detail ถ้าปล่อยเป็นข้อความกลาง ๆ ผู้ใช้จะเห็นแค่
     * "The information you sent is not valid" โดยไม่รู้ว่าช่องไหน
     */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldError> fieldErrors = ex.getBindingResult().getFieldErrors();

        Map<String, String> fields = new LinkedHashMap<>();
        fieldErrors.forEach(e -> fields.putIfAbsent(e.getField(), e.getDefaultMessage()));

        String detail = fieldErrors.isEmpty() ? null : fieldErrors.get(0).getDefaultMessage();
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status,
                detail != null ? detail : "The information you sent is not valid");
        problem.setProperty("fields", fields);

        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    /**
     * body ที่ Jackson อ่านไม่ออก เช่น ส่ง "abc" มาในช่องที่เป็นตัวเลข หรือ JSON ไม่ครบวงเล็บ
     * <p>
     * ข้อความตั้งต้นของ Spring กรณีนี้เป็นอังกฤษและมีรายละเอียดภายในของ Jackson ปนมาด้วย
     * เอาไปโชว์ใต้ฟอร์มไม่ได้ จึงถอดชื่อช่องจาก path ของ Jackson มาประกอบข้อความเอง
     */
    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, unreadableBodyDetail(ex));
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    /** ข้อความที่บอกให้ผู้ใช้รู้ว่าต้องไปแก้ช่องไหน ถ้าบอกไม่ได้ค่อยตกไปที่ข้อความรวม */
    private static String unreadableBodyDetail(HttpMessageNotReadableException ex) {
        MismatchedInputException mismatch = findMismatchedInput(ex);
        if (mismatch == null) {
            return "The request body could not be read. Check the JSON format";
        }

        List<JacksonException.Reference> path = mismatch.getPath();
        if (path.isEmpty()) {
            return "The request body could not be read. Check the JSON format";
        }

        // เอาตัวท้ายสุดของ path เพราะมันคือช่องที่พังจริง ๆ ตัวหน้า ๆ เป็นแค่ object ที่ครอบอยู่
        String field = path.get(path.size() - 1).getPropertyName();
        if (field == null) {
            return "The request body could not be read. Check the JSON format";
        }

        return isNumeric(mismatch.getTargetType())
                ? "The " + field + " field must be a number"
                : "The " + field + " field has an invalid format";
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
