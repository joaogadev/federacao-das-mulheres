import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty() id!:string;
  @ApiProperty() email!:string;
  @ApiProperty({enum:['ADMIN','CONSULTA']}) role!:'ADMIN'|'CONSULTA';
}
export class SessionDto {
  @ApiProperty({type:UserDto}) user!:UserDto;
  @ApiProperty() csrfToken!:string;
}
export class LoginDto {
  @ApiProperty({format:'email'}) email!:string;
  @ApiProperty({format:'password'}) password!:string;
}
export class DecisionDto {
  @ApiProperty({enum:['APROVADA','REPROVADA']}) status!:'APROVADA'|'REPROVADA';
  @ApiProperty({minLength:3,maxLength:500}) reason!:string;
}
export class PersonDto {
  @ApiProperty({format:'uuid'}) id!:string;
  @ApiProperty() name!:string;
  @ApiPropertyOptional({nullable:true}) document?:string|null;
  @ApiPropertyOptional({nullable:true}) email!:string|null;
  @ApiPropertyOptional({nullable:true}) phone!:string|null;
}
export class PaymentDto {
  @ApiProperty({format:'uuid'}) id!:string;
  @ApiPropertyOptional() asaasId?:string;
  @ApiPropertyOptional() customerId?:string;
  @ApiPropertyOptional({format:'uuid',nullable:true}) subscriptionId?:string|null;
  @ApiPropertyOptional({format:'uuid',nullable:true}) donationId?:string|null;
  @ApiProperty() status!:string;
  @ApiProperty() billingType!:string;
  @ApiProperty({type:'integer'}) amountCents!:number;
  @ApiPropertyOptional({type:'integer',nullable:true}) netCents?:number|null;
  @ApiPropertyOptional({nullable:true,format:'date-time'}) dueDate!:string|null;
  @ApiPropertyOptional({nullable:true,format:'date-time'}) paidAt?:string|null;
  @ApiPropertyOptional({nullable:true,format:'date-time'}) receivedAt!:string|null;
}
export class SubscriptionDto {
  @ApiProperty({format:'uuid'}) id!:string;
  @ApiPropertyOptional() asaasId?:string;
  @ApiProperty() status!:string;
  @ApiProperty() cycle!:string;
  @ApiProperty({type:'integer'}) amountCents!:number;
  @ApiPropertyOptional({nullable:true,format:'date-time'}) nextDueDate?:string|null;
  @ApiProperty({type:[PaymentDto]}) payments!:PaymentDto[];
}
export class MembershipDto {
  @ApiProperty({format:'uuid'}) id!:string;
  @ApiProperty({enum:['PENDENTE','APROVADA','REPROVADA']}) status!:string;
  @ApiProperty({format:'date-time'}) createdAt!:string;
  @ApiPropertyOptional({nullable:true,format:'date-time'}) decidedAt?:string|null;
  @ApiProperty({type:PersonDto}) person!:PersonDto;
  @ApiProperty({type:[SubscriptionDto]}) subscriptions!:SubscriptionDto[];
  @ApiPropertyOptional({type:'array',items:{type:'object'}}) history?:object[];
}
export class MembershipPageDto {
  @ApiProperty({type:[MembershipDto]}) items!:MembershipDto[];
  @ApiProperty({type:'integer'}) total!:number;
  @ApiProperty({type:'integer'}) page!:number;
  @ApiProperty({type:'integer'}) limit!:number;
}
export class DonationDto {
  @ApiProperty({format:'uuid'}) id!:string;
  @ApiProperty({format:'date-time'}) createdAt!:string;
  @ApiProperty({type:PersonDto}) person!:PersonDto;
  @ApiPropertyOptional({type:PaymentDto,nullable:true}) payment!:PaymentDto|null;
}
export class DonationPageDto {
  @ApiProperty({type:[DonationDto]}) items!:DonationDto[];
  @ApiProperty({type:'integer'}) total!:number;
  @ApiProperty({type:'integer'}) page!:number;
  @ApiProperty({type:'integer'}) limit!:number;
  @ApiProperty({type:'integer',description:'Total recebido em centavos, filtrado por busca de pessoa; independe do filtro financeiro'}) receivedTotalCents!:number;
}
export class SummaryDto {
  @ApiProperty({type:'integer'}) memberships!:number;
  @ApiProperty({type:'integer'}) donations!:number;
  @ApiProperty({type:'integer'}) monthlyReceivedCents!:number;
  @ApiProperty({type:'integer'}) donationReceivedCents!:number;
  @ApiProperty({type:'integer'}) monthlyOverdue!:number;
  @ApiPropertyOptional({nullable:true,type:'object'}) lastSync!:object|null;
}
export class InboxEventDto {
  @ApiProperty() id!:string;
  @ApiProperty() type!:string;
  @ApiProperty({enum:['FAILED','UNRESOLVED']}) state!:string;
  @ApiProperty({type:'integer'}) attempts!:number;
  @ApiProperty({format:'date-time'}) receivedAt!:string;
  @ApiPropertyOptional({nullable:true}) lastError!:string|null;
}
export class AsaasWebhookDto {
  @ApiProperty() id!:string;
  @ApiProperty() event!:string;
  @ApiPropertyOptional({type:'object'}) payment?:object;
  @ApiPropertyOptional({type:'object'}) subscription?:object;
}
