import { TouchableOpacity, Text, Image, View } from 'react-native';

export default function MenuButton({ title, icon, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="w-[48%] bg-green-50 border border-green-200 rounded-xl p-4 mb-3 flex-col items-center justify-center shadow-sm"
    >
      {icon && (
        <Image
          source={icon}
          className="w-14 h-14 mb-2"
          resizeMode="contain"
        />
      )}
      <Text className="text-gray-800 font-semibold text-center text-base">
        {title}
      </Text>
    </TouchableOpacity>
  );
}