import { Controller, Get, Param, Query } from "@nestjs/common";
import { PublicInsuranceReadService } from "./public-insurance-read.service";
import { CompareInsuranceProductsQueryDto, ListInsuranceProductsQueryDto, ListInsuranceProvidersQueryDto } from "./dto/insurance.dto";

/** Public directory — no guard by design, mirroring PublicAnimalSupportController/PublicLostPetController. Anonymous users can browse and compare providers/products (spec: "insurance discovery... comparison... public"). */
@Controller("insurance")
export class PublicInsuranceController {
  constructor(private readonly reads: PublicInsuranceReadService) {}

  @Get("providers")
  listProviders(@Query() query: ListInsuranceProvidersQueryDto) {
    return this.reads.listProviders(query);
  }

  @Get("providers/:providerId")
  getProvider(@Param("providerId") providerId: string) {
    return this.reads.getProvider(providerId);
  }

  @Get("products")
  listProducts(@Query() query: ListInsuranceProductsQueryDto) {
    return this.reads.listProducts(query);
  }

  @Get("products/compare")
  compareProducts(@Query() query: CompareInsuranceProductsQueryDto) {
    return this.reads.compareProducts(query);
  }

  @Get("products/:productId")
  getProduct(@Param("productId") productId: string) {
    return this.reads.getProduct(productId);
  }
}
