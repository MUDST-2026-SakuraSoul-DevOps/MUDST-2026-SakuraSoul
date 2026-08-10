package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.common.NotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * ตัวอย่างการเขียน unit test ฝั่ง backend ไว้ให้ทีมก๊อปไปทำส่วนของตัวเอง
 * <p>
 * ไม่แตะ database ไม่ยก Spring context ใช้ Mockito ปลอม repository เอา
 * เทสแบบนี้รันเร็วมากและพังเฉพาะตอน logic ผิดจริง ไม่ใช่ตอน environment มีปัญหา
 */
@ExtendWith(MockitoExtension.class)
class RoomServiceTest {

    @Mock
    private RoomRepository roomRepository;

    @InjectMocks
    private RoomService roomService;

    @Test
    @DisplayName("แปลง entity เป็น response ครบทุกฟิลด์และคงลำดับที่ repository ส่งมา")
    void listRoomsMapsEveryField() {
        when(roomRepository.findAllByOrderByRoomNumberAsc())
                .thenReturn(List.of(room(1L, "101", (short) 1, "3500.00"),
                        room(2L, "201", (short) 2, "3800.00")));

        List<RoomSummaryResponse> rooms = roomService.listRooms();

        assertThat(rooms).hasSize(2);
        assertThat(rooms.get(0).roomNumber()).isEqualTo("101");
        assertThat(rooms.get(0).floor()).isEqualTo(1);
        assertThat(rooms.get(0).baseRent()).isEqualByComparingTo("3500.00");
        assertThat(rooms.get(1).roomNumber()).isEqualTo("201");
        assertThat(rooms.get(1).floor()).isEqualTo(2);
    }

    @Test
    @DisplayName("ไม่มีห้องในระบบต้องได้ลิสต์ว่าง ไม่ใช่ null")
    void listRoomsReturnsEmptyListWhenNoRooms() {
        when(roomRepository.findAllByOrderByRoomNumberAsc()).thenReturn(List.of());

        assertThat(roomService.listRooms()).isEmpty();
    }

    @Test
    @DisplayName("ขอห้องที่มีอยู่ ต้องได้รายละเอียดรวมหมายเหตุ")
    void getRoomReturnsDetail() {
        Room room = room(5L, "105", (short) 1, "3500.00");
        room.setNote("แอร์เพิ่งล้างเมื่อเดือนที่แล้ว");
        when(roomRepository.findById(5L)).thenReturn(Optional.of(room));

        RoomDetailResponse detail = roomService.getRoom(5L);

        assertThat(detail.roomNumber()).isEqualTo("105");
        assertThat(detail.note()).isEqualTo("แอร์เพิ่งล้างเมื่อเดือนที่แล้ว");
    }

    @Test
    @DisplayName("ขอห้องที่ไม่มีต้องโยน NotFoundException เพื่อให้กลายเป็น 404 ไม่ใช่ 500")
    void getRoomThrowsWhenMissing() {
        when(roomRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> roomService.getRoom(999L))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("999");
    }

    private static Room room(Long id, String roomNumber, short floor, String baseRent) {
        Room room = new Room(roomNumber, floor, new BigDecimal(baseRent));
        // id ถูกกำหนดโดย database ตอน insert เทสเลยต้องยัดเอง
        ReflectionTestUtils.setField(room, "id", id);
        return room;
    }
}
