package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigResponse;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.BankAccountRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.LateInterestRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ApartmentConfigControllerTest {

    @Mock
    private ApartmentConfigService apartmentConfigService;

    @InjectMocks
    private ApartmentConfigController apartmentConfigController;

    @Test
    void getReturnsTheServiceResponse() {
        ApartmentConfigResponse expected = response("8.00", "18.00", "300.00", "250.00");
        when(apartmentConfigService.get()).thenReturn(expected);

        assertThat(apartmentConfigController.get()).isSameAs(expected);
        verify(apartmentConfigService).get();
    }

    @Test
    void updateForwardsTheRequestAndReturnsTheServiceResponse() {
        ApartmentConfigRequest request = new ApartmentConfigRequest(
                new BigDecimal("12.50"), new BigDecimal("22.00"),
                new BigDecimal("350.00"), new BigDecimal("0.00"));
        ApartmentConfigResponse expected = response("12.50", "22.00", "350.00", "0.00");
        when(apartmentConfigService.update(request)).thenReturn(expected);

        assertThat(apartmentConfigController.update(request)).isSameAs(expected);
        verify(apartmentConfigService).update(request);
    }

    @Test
    void updateLateInterestForwardsTheRequestAndReturnsTheServiceResponse() {
        LateInterestRequest request = new LateInterestRequest(new BigDecimal("1.50"), new BigDecimal("5"));
        ApartmentConfigResponse expected = response("8.00", "18.00", "300.00", "250.00");
        when(apartmentConfigService.updateLateInterest(request)).thenReturn(expected);

        assertThat(apartmentConfigController.updateLateInterest(request)).isSameAs(expected);
        verify(apartmentConfigService).updateLateInterest(request);
    }

    @Test
    void updateBankAccountForwardsTheRequestAndReturnsTheServiceResponse() {
        BankAccountRequest request = new BankAccountRequest("Kasikornbank", "Sakura Soul Apartment",
                "012-3-45678-9", "0812345678");
        ApartmentConfigResponse expected = response("8.00", "18.00", "300.00", "250.00");
        when(apartmentConfigService.updateBankAccount(request)).thenReturn(expected);

        assertThat(apartmentConfigController.updateBankAccount(request)).isSameAs(expected);
        verify(apartmentConfigService).updateBankAccount(request);
    }

    private static ApartmentConfigResponse response(String electric, String water,
            String commonArea, String internet) {
        return new ApartmentConfigResponse(new BigDecimal(electric), new BigDecimal(water),
                new BigDecimal(commonArea), new BigDecimal(internet), new BigDecimal("0.00"), 0, null,
                Instant.parse("2026-09-09T00:00:00Z"));
    }
}
