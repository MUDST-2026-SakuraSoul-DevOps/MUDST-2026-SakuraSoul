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

    /**
     * ยืนยันตัวตนไม่ผ่าน เช่น กรอกรหัสผ่านผิดที่หน้า Login (US-01)
     * <p>
     * ต่างจาก 401 ที่ออกมาจาก authenticationEntryPoint ใน SecurityConfig ตรงที่ตัวนั้น
     * คือ "ยังไม่ได้ล็อกอินแล้วไปเรียก endpoint ที่ต้องล็อกอิน" ส่วนตัวนี้คือ "ล็อกอินแล้ว
     * แต่ข้อมูลไม่ถูก" ทั้งสองทางตอบเป็น ProblemDetail เหมือนกัน ต่างกันแค่ข้อความใน detail
     */
    @ExceptionHandler(UnauthorizedException.class)
    ProblemDetail handleUnauthorized(UnauthorizedException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, ex.getMessage());
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
     * <p>
     * supply_item_sku_uk คือรหัส SKU ของอุปกรณ์ในคลังซ้ำ (US-17) หลักการเดียวกันอีก
     * ตัวหนึ่ง SupplyService เช็คให้ข้อความอ่านรู้เรื่อง ส่วนตัวกันจริงคือ constraint ตัวนี้
     * <p>
     * maintenance_ticket_reminder_due_uk คือใบแจ้งซ่อมซ้ำจากการแจ้งเตือนตามรอบใบเดียวกัน
     * ในวันครบกำหนดเดียวกัน (US-14-S2) ปกติการล็อกแถวใน ReminderService.runDue กันไว้
     * ตั้งแต่ต้นทางแล้ว ที่มาถึงตรงนี้ได้คือสอง pod ยิงงานประจำวันพร้อมกันจนหลุดมาถึง
     * ฐานข้อมูล ซึ่งแปลว่าใบของรอบนี้มีคนสร้างไปแล้ว ไม่ใช่ระบบพัง
     */
    private static String constraintMessage(DataIntegrityViolationException ex) {
        String cause = ex.getMostSpecificCause().getMessage();
        if (cause != null && cause.contains("lease_no_overlap")) {
            return "ช่วงวันที่ที่เลือกทับกับสัญญาที่ยังไม่สิ้นสุดของห้องนี้ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
        }
        if (cause != null && cause.contains("tenant_national_id_uk")) {
            return "มีผู้เช่าที่ใช้เลขบัตรประชาชนนี้อยู่แล้ว";
        }
        if (cause != null && cause.contains("supply_item_sku_uk")) {
            return "มีอุปกรณ์ที่ใช้รหัส SKU นี้อยู่แล้ว";
        }
        if (cause != null && cause.contains("maintenance_ticket_reminder_due_uk")) {
            return "ใบแจ้งซ่อมของการแจ้งเตือนรอบนี้ถูกสร้างไปแล้ว";
        }
        return "ข้อมูลชนกับที่มีอยู่แล้วในระบบ";
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
