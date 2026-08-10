import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const allSamplePlants = [
	{ id: "1", name: "Purple Elegance", species: "dendrobium", location: "Near Gate" },
	{ id: "2", name: "White Velvet", species: "phalaenopsis", location: "Front Door" },
	{ id: "3", name: "Golden Sunset", species: "oncidium", location: "Living Room Window" },
	{ id: "4", name: "Tiger Orchid", species: "dendrobium", location: "Balcony - North" },
	{ id: "5", name: "Pink Princess", species: "phalaenopsis", location: "Garden Greenhouse" },
	{ id: "6", name: "Dancing Lady", species: "oncidium", location: "Shaded Veranda" },
];

export default function AllPlantsScreen() {
	const router = useRouter();

	return (
		<SafeAreaView className="flex-1 bg-gray-50">

			<Text className="text-2xl font-bold text-gray-800 mt-6 mb-2 mx-7">All Orchid Plants</Text>

			<ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
				{allSamplePlants.map((item) => (
					<TouchableOpacity
						key={item.id}
						activeOpacity={0.7}
						onPress={() => router.push({ pathname: "/plant-details", params: { id: item.id } })}
						className="bg-white px-3.5 py-2.5 rounded-xl mb-2 border border-gray-200 flex-row items-center justify-between shadow-xs"
					>
						<View className="flex-1">
							<Text className="text-sm font-semibold text-emerald-600 uppercase mb-0.5">
								{item.species}
							</Text>
							<Text className="text-xl font-bold text-gray-800 mb-0.5">
								{item.name}
							</Text>

							<Text className="text-sm font-semibold text-gray-500">
								{item.location}
							</Text>
						</View>

						{/* Arrow Navigation */}
						<Text className="text-gray-400 font-bold text-xl px-1">›</Text>
					</TouchableOpacity>
				))}
			</ScrollView>
		</SafeAreaView>
	);
}