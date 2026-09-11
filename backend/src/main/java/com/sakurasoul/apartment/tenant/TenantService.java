package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class TenantService {

    private final TenantRepository tenantRepository;

    public TenantService(TenantRepository tenantRepository) {
        this.tenantRepository = tenantRepository;
    }

    @Transactional(readOnly = true)
    public List<TenantResponse> list() {
        return tenantRepository.findAllByOrderByFullNameAsc().stream()
                .map(TenantResponse::of)
                .toList();
    }

    @Transactional(readOnly = true)
    public TenantResponse get(Long id) {
        return tenantRepository.findById(id)
                .map(TenantResponse::of)
                .orElseThrow(() -> new NotFoundException("tenant", id));
    }

    @Transactional
    public TenantResponse create(CreateTenantRequest request) {
        Tenant tenant = new Tenant(request.fullName(), request.phone(), request.nationalId());
        return TenantResponse.of(tenantRepository.save(tenant));
    }
}
