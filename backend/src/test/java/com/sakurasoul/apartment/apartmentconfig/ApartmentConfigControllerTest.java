package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for SSK-22 / Apartment Config Backend.
 *
 * Service, validation, and database migration tests already cover the business
 * rules. This controller test keeps the API boundary small and safe by checking
 * that the controller delegates GET and PUT requests to ApartmentConfigService.
 */
@ExtendWith(MockitoExtension.class)
class ApartmentConfigControllerTest {

    @Mock
    private ApartmentConfigService apartmentConfigService;

    @InjectMocks
    private ApartmentConfigController apartmentConfigController;

    @Test
    @DisplayName("GET apartment config returns the service response")
    void getReturnsTheServiceResponse() {
        ApartmentConfigResponse expected = response("8.00", "18.00", "300.00", "250.00");
        when(apartmentConfigService.get()).thenReturn(expected);

        ApartmentConfigResponse actual = apartmentConfigController.get();

        assertThat(actual).isSameAs(expected);
        verify(apartmentConfigService).get();
    }

    @Test
    @DisplayName("PUT apartment config forwards the request and returns the updated service response")
    void updateForwardsTheRequestAndReturnsTheServiceResponse() {
        ApartmentConfigRequest request = request("12.50", "22.00", "350.00", "0.00");
        ApartmentConfigResponse expected = response("12.50", "22.00", "350.00", "0.00");
        when(apartmentConfigService.update(request)).thenReturn(expected);

        ApartmentConfigResponse actual = apartmentConfigController.update(request);

        assertThat(actual).isSameAs(expected);
        verify(apartmentConfigService).update(request);
    }

    private static ApartmentConfigRequest request(String electric, String water,
            String commonArea, String internet) {
        return new ApartmentConfigRequest(new BigDecimal(electric), new BigDecimal(water),
                new BigDecimal(commonArea), new BigDecimal(internet));
    }

    private static ApartmentConfigResponse response(String electric, String water,
            String commonArea, String internet) {
        return new ApartmentConfigResponse(new BigDecimal(electric), new BigDecimal(water),
                new BigDecimal(commonArea), new BigDecimal(internet), LocalDate.of(2026, 9, 9));
    }
}
