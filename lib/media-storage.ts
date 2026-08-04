import { isCloudinaryDeliveryUrl } from "@/lib/cloudinary"
import { isR2DeliveryUrl } from "@/lib/r2"

export function isMediaDeliveryUrl(value: string) {
  return isR2DeliveryUrl(value) || isCloudinaryDeliveryUrl(value)
}
